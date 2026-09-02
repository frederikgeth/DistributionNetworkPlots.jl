(function () {
  "use strict";

  const MODULE_VERSION = "deterministic-layout-v2";
  const MIN_BUS_GAP = 64;
  const LAYER_STEP = 190;
  const CANVAS_PADDING = { left: 70, top: 86, right: 90, bottom: 82 };

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
      const byDepth = new Map();
      buses.forEach((bus) => { const d = depth.get(bus.ref.id) || 0; if (!byDepth.has(d)) byDepth.set(d, []); byDepth.get(d).push(bus); });
      const positions = new Map();
      const maxLevelSize = Math.max(1, ...[...byDepth.values()].map((level) => level.length));
      const layoutHeight = Math.max(360, (maxLevelSize - 1) * MIN_BUS_GAP);
      for (const [d, level] of byDepth.entries()) {
        level.sort((a, b) => a.ref.id.localeCompare(b.ref.id));
        const start = CANVAS_PADDING.top + (layoutHeight - (level.length - 1) * MIN_BUS_GAP) / 2;
        const column = layout.direction === "load-to-source" ? maxDepth - d : d;
        level.forEach((bus, i) => positions.set(bus.ref.id, [CANVAS_PADDING.left + column * LAYER_STEP, start + i * MIN_BUS_GAP]));
      }
      for (const [id, point] of Object.entries(layout.locked || {})) {
        if (Array.isArray(point) && point.length === 2 && point.every(Number.isFinite)) positions.set(id, [point[0], point[1]]);
      }
      return positions;
    }

    function singleBounds(positions) {
      const points = [...(positions || new Map()).values()].filter((point) => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite));
      const maxX = Math.max(670, ...points.map((point) => point[0]));
      const maxY = Math.max(360, ...points.map((point) => point[1]));
      return {
        width: Math.ceil(maxX + CANVAS_PADDING.right),
        height: Math.max(500, Math.ceil(maxY + CANVAS_PADDING.bottom)),
        minBusGap: MIN_BUS_GAP
      };
    }

    return Object.freeze({ MODULE_VERSION, singlePositions, singleBounds });
  }

  globalThis.BMOPFLayouts = Object.freeze({ MODULE_VERSION, createDeterministicLayout });
})();
