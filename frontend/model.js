(function () {
  "use strict";

  const ASSET_KINDS = new Set([
    "bus", "line", "switch", "transformer", "load", "generator", "ibr",
    "shunt", "capacitor", "voltage_source", "dc_bus", "dc_branch",
    "dc_load", "dc_source", "dc_grounding"
  ]);
  const FULLY_RENDERED_KINDS = new Set([
    "bus", "line", "switch", "transformer", "load", "generator", "ibr",
    "shunt", "capacitor", "voltage_source"
  ]);

  function pointerEscape(value) {
    return String(value).replace(/~/g, "~0").replace(/\//g, "~1");
  }

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function entriesFor(kind, table, pointer) {
    if (!isObject(table)) return [];
    const entries = [];
    for (const [id, value] of Object.entries(table)) {
      if (kind === "transformer" && isObject(value) &&
          !("bus" in value) && !("bus_from" in value) && !("bus_to" in value)) {
        for (const [nestedId, nested] of Object.entries(value)) {
          if (isObject(nested)) {
            entries.push({ id: nestedId, value: nested,
              pointer: `${pointer}/${pointerEscape(id)}/${pointerEscape(nestedId)}` });
          }
        }
      } else if (isObject(value)) {
        entries.push({ id, value, pointer: `${pointer}/${pointerEscape(id)}` });
      }
    }
    return entries;
  }

  function coordinateOf(record) {
    if (!isObject(record)) return null;
    const longitude = record.longitude ?? record.lon;
    const latitude = record.latitude ?? record.lat;
    return Number.isFinite(Number(longitude)) && Number.isFinite(Number(latitude))
      ? { longitude: Number(longitude), latitude: Number(latitude), space: "geographic" }
      : null;
  }

  function terminalsOf(record, preferred) {
    const value = record?.[preferred] ?? record?.terminal_map ?? record?.terminal_names;
    return Array.isArray(value) ? value.map(String) : [];
  }

  function port(id, role, busId, terminals) {
    return { id, role, busId: String(busId), terminals: terminals.map(String) };
  }

  function portsOf(kind, id, record) {
    if (!isObject(record)) return [];
    if (kind === "transformer" && Array.isArray(record.windings)) {
      return record.windings.map((winding, i) => port(`${id}:winding:${i + 1}`, `winding ${i + 1}`, winding.bus, terminalsOf(winding)));
    }
    if (record.bus !== undefined) {
      return [port(`${id}:connection`, "connection", record.bus, terminalsOf(record))];
    }
    if (record.bus_from !== undefined || record.bus_to !== undefined) {
      const ports = [];
      if (record.bus_from !== undefined) {
        ports.push(port(`${id}:from`, "from", record.bus_from,
          terminalsOf(record, "terminal_map_from")));
      }
      if (record.bus_to !== undefined) {
        ports.push(port(`${id}:to`, "to", record.bus_to,
          terminalsOf(record, "terminal_map_to")));
      }
      return ports;
    }
    return [];
  }

  function connectionsOf(kind, ports) {
    if (ports.length < 2) return [];
    // An n-winding transformer is a device with several winding ports, not a
    // set of direct bus-to-bus branches. Keep the ports explicit until a
    // renderer can draw the transformer body and its spokes faithfully.
    if (kind === "transformer" && ports.length > 2) return [];
    const from = ports[0];
    return ports.slice(1).map((to) => ({
      from,
      to,
      pairs: from.terminals.map((terminal, i) => [terminal, to.terminals[i] ?? "?"])
    }));
  }

  function statusOf(kind, record) {
    if (kind === "switch" && record.open_switch === true) return "open";
    if (record.status === 0 || record.in_service === false) return "out_of_service";
    if (record.status === 1 || record.in_service === true) return "in_service";
    return "unknown";
  }

  function supportLevel(kind, record) {
    if (kind === "transformer" && Array.isArray(record?.windings)) return "focused";
    if (FULLY_RENDERED_KINDS.has(kind)) return "full";
    return "raw-only";
  }

  function entity(kind, id, pointer, sourceRecord) {
    const ports = portsOf(kind, id, sourceRecord);
    return {
      ref: { kind, id: String(id), pointer },
      ports,
      connections: connectionsOf(kind, ports),
      status: statusOf(kind, sourceRecord),
      support: supportLevel(kind, sourceRecord),
      sourceRecord
    };
  }

  function buildCaseIndex(document) {
    if (!isObject(document)) throw new Error("The case must be a JSON object.");
    const buses = [];
    const assets = [];
    const entities = [];
    const byRef = new Map();
    const byBus = new Map();
    const warnings = [];

    const addEntity = (item, isAsset) => {
      entities.push(item);
      byRef.set(`${item.ref.kind}:${item.ref.id}:${item.ref.pointer}`, item);
      if (isAsset) assets.push(item);
      for (const p of item.ports) {
        if (!byBus.has(p.busId)) byBus.set(p.busId, []);
        byBus.get(p.busId).push(item);
      }
    };

    for (const record of entriesFor("bus", document.bus, "/bus")) {
      const bus = {
        ref: { kind: "bus", id: record.id, pointer: record.pointer },
        terminals: terminalsOf(record.value),
        groundedTerminals: Array.isArray(record.value.perfectly_grounded_terminals)
          ? record.value.perfectly_grounded_terminals.map(String) : [],
        coordinates: coordinateOf(record.value),
        sourceRecord: record.value,
        ports: [],
        connections: [],
        status: "in_service",
        support: "full"
      };
      buses.push(bus);
      addEntity(bus, true);
    }

    for (const kind of Object.keys(document)) {
      if (kind === "bus" || kind === "meta" || kind === "name" || kind === "$schema") continue;
      const entries = entriesFor(kind, document[kind], `/${pointerEscape(kind)}`);
      for (const item of entries) {
        const e = entity(kind, item.id, item.pointer, item.value);
        addEntity(e, ASSET_KINDS.has(kind));
        for (const p of e.ports) {
          if (!buses.some((b) => b.ref.id === p.busId)) {
            warnings.push(`${kind}/${item.id} references missing bus ${p.busId}`);
          }
        }
      }
    }

    const counts = {};
    for (const item of assets) counts[item.ref.kind] = (counts[item.ref.kind] || 0) + 1;
    const coordinateCount = buses.filter((b) => b.coordinates).length;
    if (coordinateCount === 0) warnings.push("No geographic bus coordinates were found.");
    else if (coordinateCount < buses.length) warnings.push(`Coordinates found for ${coordinateCount}/${buses.length} buses.`);
    if (!document.$schema) warnings.push("No BMOPF schema identifier was provided; semantic support is best effort.");
    else if (!String(document.$schema).toLowerCase().includes("bmopf")) {
      warnings.push(`Schema identifier is not recognised as BMOPF: ${String(document.$schema)}`);
    }
    const supportCounts = {};
    for (const item of entities) supportCounts[item.support] = (supportCounts[item.support] || 0) + 1;

    return {
      raw: document,
      name: typeof document.name === "string" ? document.name : "Unnamed BMOPF case",
      buses,
      assets,
      entities,
      byRef,
      byBus,
      counts,
      warnings,
      supportCounts,
      coordinateCount,
      schema: document.$schema || null
    };
  }

  globalThis.BMOPFModel = { buildCaseIndex };
})();
