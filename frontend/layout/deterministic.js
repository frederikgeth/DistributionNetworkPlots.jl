(function () {
  "use strict";

  const MODULE_VERSION = "deterministic-layout-v1";

  function createDeterministicLayout(dependencies) {
    const getIndex = dependencies.getIndex;
    const getLayout = dependencies.getLayout;

    function singlePositions() {
      const index = getIndex();
      const layout = getLayout() || {};
      const buses = index?.buses || [];
      const adjacency = new Map(buses.map((bus) => [bus.ref.id, new Set()]));
      for (const item of index?.assets || []) {
        const ports = item.ports || [];
        if (ports.length < 2) continue;
        const anchor = ports[0].busId;
        for (const port of ports.slice(1)) {
          if (!adjacency.has(anchor)) adjacency.set(anchor, new Set());
          if (!adjacency.has(port.busId)) adjacency.set(port.busId, new Set());
          adjacency.get(anchor).add(port.busId);
          adjacency.get(port.busId).add(anchor);
        }
      }
      const roots = (index?.assets || [])
        .filter((item) => item.ref.kind === "voltage_source" && item.ports?.[0])
        .map((item) => item.ports[0].busId)
        .filter((id, i, all) => all.indexOf(id) === i);
      const depth = new Map();
      const configuredRoot = layout.root && layout.root !== "auto" && buses.some((bus) => bus.ref.id === layout.root) ? layout.root : null;
      const queue = configuredRoot ? [configuredRoot] : (roots.length ? roots : (buses[0] ? [buses[0].ref.id] : []));
      queue.forEach((id) => depth.set(id, 0));
      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const id = queue[cursor];
        for (const next of adjacency.get(id) || []) {
          if (!depth.has(next)) { depth.set(next, depth.get(id) + 1); queue.push(next); }
        }
      }
      let maxDepth = Math.max(0, ...depth.values());
      buses.forEach((bus) => { if (!depth.has(bus.ref.id)) { maxDepth += 1; depth.set(bus.ref.id, maxDepth); } });
      const xStep = Math.min(180, 650 / Math.max(maxDepth, 1));
      const byDepth = new Map();
      buses.forEach((bus) => { const d = depth.get(bus.ref.id) || 0; if (!byDepth.has(d)) byDepth.set(d, []); byDepth.get(d).push(bus); });
      const positions = new Map();
      for (const [d, level] of byDepth.entries()) {
        level.sort((a, b) => a.ref.id.localeCompare(b.ref.id));
        const spacing = Math.min(96, 360 / Math.max(level.length, 1));
        const start = 250 - ((level.length - 1) * spacing) / 2;
        const column = layout.direction === "load-to-source" ? maxDepth - d : d;
        level.forEach((bus, i) => positions.set(bus.ref.id, [70 + column * xStep, start + i * spacing]));
      }
      for (const [id, point] of Object.entries(layout.locked || {})) {
        if (Array.isArray(point) && point.length === 2 && point.every(Number.isFinite)) positions.set(id, [point[0], point[1]]);
      }
      return positions;
    }

    return Object.freeze({ MODULE_VERSION, singlePositions });
  }

  globalThis.BMOPFLayouts = Object.freeze({ MODULE_VERSION, createDeterministicLayout });
})();
