(function () {
  "use strict";

  const MODULE_VERSION = "geospatial-renderer-v1";

  function createGeospatialRenderer(dependencies) {
    const state = dependencies.state;
    const escapeHtml = dependencies.escapeHtml;
    const setStatus = dependencies.setStatus;
    const setCanvas = dependencies.setCanvas;
    const svgShell = dependencies.svgShell;
    const bindSvgSelection = dependencies.bindSvgSelection;
    const entityLabelSvg = dependencies.entityLabelSvg;

    function drawGeo() {
      const { positions, geographic, project, unmapped } = dependencies.busCoordinates();
      let content = "";
      for (const item of dependencies.overviewAssets().filter((e) => e.connections?.length)) {
        for (const connection of item.connections) {
          const a = positions.get(connection.from.busId); const b = positions.get(connection.to.busId);
          if (!a || !b) continue;
          const selected = dependencies.sameRef(item.ref, state.selected);
          const route = dependencies.geometryPointsOf(item).map(([longitude, latitude]) => project(longitude, latitude));
          const visual = dependencies.resultVisual(item, selected, dependencies.colourOf(item.ref.kind));
          const stroke = visual.colour; const width = visual.width; const status = dependencies.resultStatus(item);
          const opacity = status === "out_of_service" ? .35 : status === "open" ? .55 : .85;
          if (route.length >= 2) content += `<polyline points="${route.map(([x, y]) => `${x},${y}`).join(" ")}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-opacity="${opacity}" ${status === "open" ? "stroke-dasharray=\"8 6\"" : ""} data-kind="${escapeHtml(item.ref.kind)}" data-id="${escapeHtml(item.ref.id)}"><title>${escapeHtml(dependencies.titleOf(item))} · routed geometry${escapeHtml(dependencies.resultTooltip(item))}</title></polyline>`;
          else content += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${stroke}" stroke-width="${width}" stroke-opacity="${opacity}" ${status === "open" ? "stroke-dasharray=\"8 6\"" : ""} data-kind="${escapeHtml(item.ref.kind)}" data-id="${escapeHtml(item.ref.id)}"><title>${escapeHtml(dependencies.titleOf(item))}${escapeHtml(dependencies.resultTooltip(item))}</title></line>`;
        }
      }
      for (const bus of dependencies.overviewBuses()) {
        const p = positions.get(bus.ref.id); const selected = dependencies.sameRef(bus.ref, state.selected);
        if (!p) continue;
        const voltage = dependencies.resultVoltageVisual(bus, selected, "#2f6fb3");
        const voltageDash = voltage.dash ? ` stroke-dasharray="${voltage.dash}"` : "";
        const voltageGlyph = voltage.level === "high" ? "!" : voltage.level === "moderate" ? "~" : "";
        content += `<g data-kind="bus" data-id="${escapeHtml(bus.ref.id)}"><circle cx="${p[0]}" cy="${p[1]}" r="${selected ? 12 : 8}" fill="${selected ? "#e8f0f8" : "#fffdf9"}" stroke="${voltage.colour}" stroke-width="${selected ? 4 : 2}"${voltageDash}><title>bus ${escapeHtml(bus.ref.id)}${escapeHtml(dependencies.resultTooltip(bus))}</title></circle>${voltageGlyph ? `<text x="${p[0]}" y="${p[1] + 4}" text-anchor="middle" fill="${voltage.colour}" font-size="10" font-weight="700">${voltageGlyph}</text>` : ""}<text x="${p[0] + 12}" y="${p[1] + 4}" fill="#37332c" font-size="12">${entityLabelSvg("bus", bus.ref.id)}</text></g>`;
      }
      content += dependencies.resultLegend();
      if (geographic && unmapped.length) content += `<text x="380" y="478" text-anchor="middle" fill="#8a4d20" font-size="12">Not placed geographically (missing coordinates): ${escapeHtml(unmapped.map((bus) => bus.ref.id).join(", "))}</text>`;
      setStatus(geographic ? `Geographic coordinates used for ${state.index.buses.length - unmapped.length}/${state.index.buses.length} buses${unmapped.length ? ` · ${unmapped.length} omitted` : ""}.` : "No geographic coordinates: showing a schematic placement.");
      setCanvas(svgShell(content));
      bindSvgSelection();
    }

    return Object.freeze({ MODULE_VERSION, drawGeo });
  }

  globalThis.BMOPFRenderers = Object.freeze({ ...(globalThis.BMOPFRenderers || {}), MODULE_VERSION, createGeospatialRenderer });
})();
