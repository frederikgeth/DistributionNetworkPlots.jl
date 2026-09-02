(function () {
  "use strict";

  const MODULE_VERSION = "single-wire-renderer-v1";

  function createSingleWireRenderer(dependencies) {
    const state = dependencies.state;
    const escapeHtml = dependencies.escapeHtml;
    const setStatus = dependencies.setStatus;
    const setCanvas = dependencies.setCanvas;
    const svgShell = dependencies.svgShell;
    const bindSvgSelection = dependencies.bindSvgSelection;

    function canvasSize(positions) {
      const base = dependencies.singleBounds ? dependencies.singleBounds(positions) : { width: 760, height: 500 };
      const routePoints = Object.values(state.layout?.routes || {}).flatMap((route) => Array.isArray(route) ? route : []);
      const manualPoints = Object.values(state.layout?.positions || {}).filter((point) => Array.isArray(point) && point.length === 2);
      const maxRouteX = Math.max(0, ...routePoints.map((point) => Number(point?.[0]) || 0), ...manualPoints.map((point) => Number(point[0]) || 0));
      const maxRouteY = Math.max(0, ...routePoints.map((point) => Number(point?.[1]) || 0), ...manualPoints.map((point) => Number(point[1]) || 0));
      return { width: Math.max(base.width, Math.ceil(maxRouteX + 90)), height: Math.max(base.height, Math.ceil(maxRouteY + 82)) };
    }

    function routeMidpoint(points) {
      if (!Array.isArray(points) || points.length < 2) return null;
      let total = 0;
      for (let i = 1; i < points.length; i += 1) total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
      if (!total) return points[0];
      let travelled = 0;
      for (let i = 1; i < points.length; i += 1) {
        const length = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
        if (travelled + length >= total / 2) {
          const fraction = (total / 2 - travelled) / (length || 1);
          return [points[i - 1][0] + (points[i][0] - points[i - 1][0]) * fraction, points[i - 1][1] + (points[i][1] - points[i - 1][1]) * fraction];
        }
        travelled += length;
      }
      return points[points.length - 1];
    }

    function movedFrom(point, fallback) {
      return Array.isArray(point) && Array.isArray(fallback) && (Math.abs(point[0] - fallback[0]) > 0.5 || Math.abs(point[1] - fallback[1]) > 0.5);
    }

    function attachmentKey(item) { return `${item.ref.kind}:${item.ref.id}`; }

    function attachmentFallbacks(items, connectedItems, positions) {
      const neighbours = new Map();
      const addNeighbour = (from, to) => { if (!neighbours.has(from)) neighbours.set(from, new Set()); neighbours.get(from).add(to); };
      connectedItems.forEach((item) => (item.connections || []).forEach((connection) => {
        addNeighbour(connection.from.busId, connection.to.busId);
        addNeighbour(connection.to.busId, connection.from.busId);
      }));
      const allBusPoints = [...positions.entries()];
      const grouped = new Map();
      items.forEach((item) => {
        const busId = item.ports?.[0]?.busId;
        if (!busId || !positions.has(busId)) return;
        if (!grouped.has(busId)) grouped.set(busId, []);
        grouped.get(busId).push(item);
      });
      const result = new Map();
      grouped.forEach((group, busId) => {
        const anchor = positions.get(busId);
        const neighbourPoints = [...(neighbours.get(busId) || [])].map((id) => positions.get(id)).filter(Boolean);
        const direction = neighbourPoints.reduce((sum, point) => {
          const dx = point[0] - anchor[0]; const dy = point[1] - anchor[1]; const distance = Math.max(1, Math.hypot(dx, dy));
          return [sum[0] + dx / distance, sum[1] + dy / distance];
        }, [0, 0]);
        group.sort((a, b) => attachmentKey(a).localeCompare(attachmentKey(b)));
        const used = [];
        group.forEach((item, index) => {
          const radius = 78 + Math.floor(index / 6) * 28;
          let best = null;
          for (let angleIndex = 0; angleIndex < 16; angleIndex += 1) {
            const angle = -Math.PI + angleIndex * Math.PI / 8;
            const point = [anchor[0] + Math.cos(angle) * radius, anchor[1] + Math.sin(angle) * radius];
            const nearestBus = Math.min(Infinity, ...allBusPoints.filter(([id]) => id !== busId).map(([, other]) => Math.hypot(point[0] - other[0], point[1] - other[1])));
            const nearestUsed = Math.min(Infinity, ...used.map((other) => Math.hypot(point[0] - other[0], point[1] - other[1])));
            const pointsAwayFromNetwork = -(direction[0] * Math.cos(angle) + direction[1] * Math.sin(angle)) * 36;
            const score = Math.min(nearestBus, nearestUsed) + pointsAwayFromNetwork;
            if (!best || score > best.score) best = { point, score };
          }
          result.set(attachmentKey(item), best.point);
          used.push(best.point);
        });
      });
      return result;
    }

    function dragLeader(point, fallback) {
      return movedFrom(point, fallback)
        ? `<line class="sld-drag-leader" x1="${fallback[0]}" y1="${fallback[1]}" x2="${point[0]}" y2="${point[1]}" stroke="#9a9388" stroke-width="1.5" stroke-dasharray="4 4"/>`
        : "";
    }

    function drawSingle() {
      const positions = dependencies.singlePositions();
      const display = state.singleDisplay || {};
      const arrowMarker = display.showArrows !== false ? ' marker-end="url(#sld-arrow)"' : "";
      const overviewAssets = dependencies.overviewAssets();
      const connectedAssets = overviewAssets.filter((e) => e.connections?.length);
      const attachedAssets = overviewAssets.filter((e) => !e.connections?.length && e.ports?.length === 1);
      const attachedFallbacks = attachmentFallbacks(attachedAssets, connectedAssets, positions);
      let content = `<defs><marker id="sld-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto" markerUnits="strokeWidth"><path d="M0 0L7 3.5L0 7z" fill="#6b655c"/></marker></defs><text x="24" y="26" fill="#37332c" font-size="13" font-weight="700">Source → load one-line view</text><text x="24" y="43" fill="#70695f" font-size="10">IEC/IEEE-inspired symbols · heavy busbars · drag buses or device symbols to refine the layout</text>`;
      const edgeCounts = new Map();
      for (const item of connectedAssets) {
        for (const connection of item.connections) {
          const key = [connection.from.busId, connection.to.busId].sort().join("|");
          edgeCounts.set(key, (edgeCounts.get(key) || 0) + 1);
        }
      }
      const edgeSeen = new Map();
      for (const item of connectedAssets) {
        for (const connection of item.connections) {
          const a = positions.get(connection.from.busId); const b = positions.get(connection.to.busId); if (!a || !b) continue;
          const selected = dependencies.sameRef(item.ref, state.selected); const visual = dependencies.resultVisual(item, selected, dependencies.colourOf(item.ref.kind));
          const status = dependencies.resultStatus(item); const opacity = status === "out_of_service" ? .35 : .85;
          const midX = a[0] + (b[0] - a[0]) / 2;
          const key = [connection.from.busId, connection.to.busId].sort().join("|");
          const ordinal = edgeSeen.get(key) || 0; edgeSeen.set(key, ordinal + 1);
          const laneOffset = (ordinal - (edgeCounts.get(key) - 1) / 2) * 18;
          const laneY = b[1] + laneOffset;
          const routeKey = `edge:${item.ref.kind}:${item.ref.id}:${connection.from.busId}:${connection.to.busId}`;
          const elkRoute = state.layout.engine === "elk" ? state.layout.routes?.[routeKey] : null;
          const path = Array.isArray(elkRoute) && elkRoute.length >= 2 ? `M${elkRoute.map((point) => `${point[0]} ${point[1]}`).join("L")}` : `M${a[0]} ${a[1]}H${midX}V${laneY}H${b[0]}V${b[1]}`;
          content += `<path d="${path}" fill="none" stroke="${visual.colour}" stroke-width="${visual.width}" stroke-opacity="${opacity}"${arrowMarker} ${status === "open" ? "stroke-dasharray=\"8 6\"" : ""} data-kind="${escapeHtml(item.ref.kind)}" data-id="${escapeHtml(item.ref.id)}"><title>${escapeHtml(dependencies.titleOf(item))}${escapeHtml(dependencies.resultTooltip(item))}</title></path>`;
          const fallbackPoint = routeMidpoint(elkRoute) || [midX, laneY];
          const symbolPoint = dependencies.singleElementPosition ? dependencies.singleElementPosition(item, fallbackPoint) : fallbackPoint;
          content += dragLeader(symbolPoint, fallbackPoint);
          content += dependencies.singleSymbol(item, symbolPoint[0], symbolPoint[1]);
        }
      }
      for (const item of attachedAssets) {
        const port = item.ports[0]; const p = positions.get(port.busId); if (!p) continue;
        const fallbackPoint = attachedFallbacks.get(attachmentKey(item)) || [p[0] + 62, p[1] - 38];
        const symbolPoint = dependencies.singleElementPosition ? dependencies.singleElementPosition(item, fallbackPoint) : fallbackPoint;
        const startX = fallbackPoint[0] < p[0] ? p[0] - 38 : p[0] + 38;
        content += `<path d="M${startX} ${p[1]}H${fallbackPoint[0]}V${fallbackPoint[1]}" fill="none" stroke="${dependencies.colourOf(item.ref.kind)}" stroke-width="2"${arrowMarker}/>`;
        content += dragLeader(symbolPoint, fallbackPoint);
        content += dependencies.singleSymbol(item, symbolPoint[0], symbolPoint[1]);
      }
      for (const item of overviewAssets.filter((e) => e.ref.kind === "transformer" && e.ports?.length > 2)) {
        const points = item.ports.map((port) => positions.get(port.busId)).filter(Boolean); if (!points.length) continue;
        const fallbackPoint = [points.reduce((sum, p) => sum + p[0], 0) / points.length, points.reduce((sum, p) => sum + p[1], 0) / points.length];
        const symbolPoint = dependencies.singleElementPosition ? dependencies.singleElementPosition(item, fallbackPoint) : fallbackPoint;
        points.forEach((p) => { content += `<path d="M${p[0]} ${p[1]}L${fallbackPoint[0]} ${fallbackPoint[1]}" fill="none" stroke="${dependencies.colourOf(item.ref.kind)}" stroke-width="2"${arrowMarker}/>`; });
        content += dragLeader(symbolPoint, fallbackPoint);
        content += dependencies.singleSymbol(item, symbolPoint[0], symbolPoint[1]);
      }
      for (const bus of dependencies.overviewBuses()) {
        const p = positions.get(bus.ref.id); const selected = dependencies.sameRef(bus.ref, state.selected);
        const voltage = dependencies.resultVoltageVisual(bus, selected, "#2f6fb3"); const voltageDash = voltage.dash ? ` stroke-dasharray="${voltage.dash}"` : ""; const voltageGlyph = voltage.level === "high" ? "!" : voltage.level === "moderate" ? "~" : "";
        const lockMark = dependencies.layoutLocked(bus.ref.id) ? " · locked" : "";
        const showBusLabel = display.showBusLabels !== false && (!display.labelsSelectedOnly || selected);
        content += `<g data-kind="bus" data-id="${escapeHtml(bus.ref.id)}"><line x1="${p[0] - 42}" y1="${p[1]}" x2="${p[0] + 42}" y2="${p[1]}" stroke="${voltage.colour}" stroke-width="${selected ? 7 : 5}"${voltageDash}/><circle cx="${p[0]}" cy="${p[1]}" r="3" fill="${voltage.colour}"/><title>bus ${escapeHtml(bus.ref.id)}${escapeHtml(lockMark)}${escapeHtml(dependencies.resultTooltip(bus))}</title>${voltageGlyph ? `<text x="${p[0] - 50}" y="${p[1] - 8}" fill="${voltage.colour}" font-size="10" font-weight="700">${voltageGlyph}</text>` : ""}${showBusLabel ? `<text x="${p[0]}" y="${p[1] + 20}" text-anchor="middle" fill="#37332c" font-size="11">${escapeHtml(bus.ref.id)}${lockMark ? " · locked" : ""}</text>` : ""}</g>`;
      }
      content += `<g class="sld-embedded-legend"><text x="24" y="474" fill="#70695f" font-size="10">Legend: heavy line = busbar · ○ = source/generator · paired coils = transformer · □ = load · ║ = capacitor · ⏚ = shunt · open blade/dashed path = open switch · dashed leader = moved symbol</text>${dependencies.resultLegend()}</g>`;
      const directionLabel = state.layout?.direction === "load-to-source" ? "load-to-source" : "source-to-load";
      const rootLabel = state.layout?.root && state.layout.root !== "auto" ? ` · root ${state.layout.root}` : " · automatic feeder root";
      const engineLabel = state.layout?.engine === "elk" ? " · ELK" : state.layout?.engine === "force" ? " · force-directed" : " · deterministic";
      const cacheLabel = state.layout?.cacheState === "stale" ? " · stale cached layout ignored" : "";
      const layoutLabel = state.layout?.engine === "force" ? "force-directed" : "layered";
      setStatus(`Single-line diagram: ${directionLabel} ${layoutLabel} layout${rootLabel}${engineLabel}${cacheLabel} with conventional busbars and device symbols.`);
      setCanvas(svgShell(content, { className: "single-wire-svg", size: canvasSize(positions) }));
      bindSvgSelection();
    }

    return Object.freeze({ MODULE_VERSION, drawSingle });
  }

  globalThis.BMOPFRenderers = Object.freeze({ ...(globalThis.BMOPFRenderers || {}), MODULE_VERSION, createSingleWireRenderer });
})();
