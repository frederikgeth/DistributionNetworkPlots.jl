(function () {
  "use strict";

  const MODULE_VERSION = "deterministic-layout-v2";
  const MIN_BUS_GAP = 64;
  const LAYER_STEP = 190;
  const CANVAS_PADDING = { left: 70, top: 86, right: 90, bottom: 82 };

  function createDeterministicLayout(dependencies) {
    const getIndex = dependencies.getIndex;
    const getLayout = dependencies.getLayout;

    function graph() {
      const index = getIndex();
      const buses = index?.buses || [];
      const adjacency = new Map(buses.map((bus) => [bus.ref.id, new Set()]));
      const edges = [];
      for (const item of index?.assets || []) {
        const ports = item.ports || [];
        if (ports.length < 2) continue;
        const anchor = ports[0].busId;
        for (const port of ports.slice(1)) {
          if (!adjacency.has(anchor)) adjacency.set(anchor, new Set());
          if (!adjacency.has(port.busId)) adjacency.set(port.busId, new Set());
          adjacency.get(anchor).add(port.busId);
          adjacency.get(port.busId).add(anchor);
          if (anchor !== port.busId) edges.push([anchor, port.busId]);
        }
      }
      return { buses, adjacency, edges };
    }

    function layeredPositions() {
      const index = getIndex();
      const layout = getLayout() || {};
      const { buses, adjacency } = graph();
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
      return positions;
    }

    function hash(value) {
      let result = 2166136261;
      for (const character of String(value)) { result ^= character.charCodeAt(0); result = Math.imul(result, 16777619); }
      return (result >>> 0) / 4294967296;
    }

    function treeSeedPositions() {
      const index = getIndex();
      const layout = getLayout() || {};
      const { buses, adjacency, edges } = graph();
      const edgeKeys = new Set();
      const uniqueEdges = edges.filter(([from, to]) => {
        const key = [from, to].sort().join("|");
        if (edgeKeys.has(key)) return false;
        edgeKeys.add(key);
        return true;
      });
      if (buses.length < 2 || uniqueEdges.length !== buses.length - 1) return null;
      const ids = new Set(buses.map((bus) => bus.ref.id));
      const sourceRoot = index?.assets?.find((item) => item.ref.kind === "voltage_source" && item.ports?.[0])?.ports?.[0]?.busId;
      const root = layout.root && layout.root !== "auto" && ids.has(layout.root) ? layout.root : ids.has(sourceRoot) ? sourceRoot : buses[0]?.ref.id;
      if (!root) return null;
      const parent = new Map([[root, null]]); const depth = new Map([[root, 0]]); const queue = [root];
      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const id = queue[cursor];
        for (const next of [...(adjacency.get(id) || [])].sort()) {
          if (!ids.has(next) || parent.has(next)) continue;
          parent.set(next, id); depth.set(next, depth.get(id) + 1); queue.push(next);
        }
      }
      if (parent.size !== buses.length) return null;
      const children = new Map(buses.map((bus) => [bus.ref.id, []]));
      parent.forEach((ancestor, id) => { if (ancestor) children.get(ancestor).push(id); });
      children.forEach((list) => list.sort());
      const leaves = [...children.values()].filter((list) => list.length === 0).length;
      const leafGap = Math.max(30, Math.min(58, 12000 / Math.max(1, leaves)));
      const maxDepth = Math.max(0, ...depth.values());
      const depthStep = Math.max(100, Math.min(165, 9000 / Math.max(1, maxDepth)));
      const positions = new Map(); let leafIndex = 0;
      const assign = (id) => {
        const descendants = children.get(id) || [];
        const y = descendants.length ? descendants.map(assign).reduce((sum, value) => sum + value, 0) / descendants.length : 110 + leafIndex++ * leafGap;
        const column = layout.direction === "load-to-source" ? maxDepth - depth.get(id) : depth.get(id);
        positions.set(id, [CANVAS_PADDING.left + column * depthStep, y]);
        return y;
      };
      assign(root);
      return positions;
    }

    function singleForcePositions() {
      const { buses, edges } = graph();
      const positions = treeSeedPositions() || layeredPositions();
      const nodes = buses.map((bus) => bus.ref.id);
      if (nodes.length < 2) return positions;
      const nodeSet = new Set(nodes);
      const velocities = new Map(nodes.map((id) => [id, [0, 0]]));
      nodes.forEach((id, index) => {
        const point = positions.get(id) || [CANVAS_PADDING.left, CANVAS_PADDING.top];
        const angle = hash(`${id}:angle`) * Math.PI * 2;
        const jitter = (hash(`${id}:jitter`) - 0.5) * 46;
        positions.set(id, [point[0] + Math.cos(angle) * jitter + (index % 3 - 1) * 12, point[1] + Math.sin(angle) * jitter]);
      });
      const edgeKeys = new Set();
      const uniqueEdges = edges.filter(([from, to]) => {
        if (!nodeSet.has(from) || !nodeSet.has(to)) return false;
        const key = [from, to].sort().join("|");
        if (edgeKeys.has(key)) return false;
        edgeKeys.add(key);
        return true;
      });
      const iterations = Math.max(32, Math.min(110, Math.round(18000 / nodes.length)));
      const springLength = 145;
      const repulsion = 9000;
      const springStrength = 0.035;
      const bounds = nodes.map((id) => positions.get(id));
      const centreX = (Math.min(...bounds.map((point) => point[0])) + Math.max(...bounds.map((point) => point[0]))) / 2;
      const centreY = (Math.min(...bounds.map((point) => point[1])) + Math.max(...bounds.map((point) => point[1]))) / 2;
      for (let iteration = 0; iteration < iterations; iteration += 1) {
        const forces = new Map(nodes.map((id) => [id, [0, 0]]));
        for (let i = 0; i < nodes.length; i += 1) {
          const first = positions.get(nodes[i]);
          for (let j = i + 1; j < nodes.length; j += 1) {
            const second = positions.get(nodes[j]);
            let dx = second[0] - first[0]; let dy = second[1] - first[1];
            const distance = Math.max(18, Math.hypot(dx, dy));
            dx /= distance; dy /= distance;
            const force = repulsion / (distance * distance);
            forces.get(nodes[i])[0] -= dx * force; forces.get(nodes[i])[1] -= dy * force;
            forces.get(nodes[j])[0] += dx * force; forces.get(nodes[j])[1] += dy * force;
          }
        }
        uniqueEdges.forEach(([from, to]) => {
          const first = positions.get(from); const second = positions.get(to);
          let dx = second[0] - first[0]; let dy = second[1] - first[1];
          const distance = Math.max(18, Math.hypot(dx, dy));
          const force = (distance - springLength) * springStrength;
          dx /= distance; dy /= distance;
          forces.get(from)[0] += dx * force; forces.get(from)[1] += dy * force;
          forces.get(to)[0] -= dx * force; forces.get(to)[1] -= dy * force;
        });
        nodes.forEach((id) => {
          const point = positions.get(id); const velocity = velocities.get(id); const force = forces.get(id);
          force[0] += (centreX - point[0]) * 0.0008; force[1] += (centreY - point[1]) * 0.0008;
          velocity[0] = (velocity[0] + force[0]) * 0.82; velocity[1] = (velocity[1] + force[1]) * 0.82;
          const magnitude = Math.hypot(velocity[0], velocity[1]);
          const step = Math.min(22, magnitude);
          if (magnitude > 0) { velocity[0] = velocity[0] / magnitude * step; velocity[1] = velocity[1] / magnitude * step; }
          positions.set(id, [Math.max(36, point[0] + velocity[0]), Math.max(CANVAS_PADDING.top, point[1] + velocity[1])]);
        });
      }
      return positions;
    }

    function singlePositions() {
      const layout = getLayout() || {};
      const forcePositions = new Map(Object.entries(layout.locked || {}).filter(([, point]) => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite)).map(([id, point]) => [id, [...point]]));
      const expectedBuses = getIndex()?.buses?.length || 0;
      const positions = layout.engine === "force" && forcePositions.size === expectedBuses ? forcePositions : layeredPositions();
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

    return Object.freeze({ MODULE_VERSION, singlePositions, singleForcePositions, singleBounds });
  }

  globalThis.BMOPFLayouts = Object.freeze({ MODULE_VERSION, createDeterministicLayout });
})();
