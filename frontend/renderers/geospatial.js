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

    function drawLegacyGeo() {
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

    let regional = false, cachedIndex = null, memberships = new Map(), cells = [], memberRows = [], memberPage = 0;
    const h = escapeHtml;
    let landmarks = [], landmarkGroups = [], visibleLandmarks = [], landmarkRows = [], landmarkPage = 0;
    function prepareRegion() {
      if (cachedIndex === state.index) return;
      landmarks = []; landmarkRows = [];
      cachedIndex = state.index; memberships = new Map(); memberRows = [];
      state.index.components.forEach((network, i) => network.busIds.forEach(id => memberships.set(id, i)));
      for (const item of state.index.assets) {
        const type = item.ref.kind === "voltage_source" ? "source" : item.ref.kind === "transformer" ? "transformer" : item.ref.kind === "switch" && item.status === "open" ? "open switch" : item.ref.kind === "bus" && item.groundedTerminals.length ? "ground" : null;
        if (type) landmarks.push({ item, type, ids: item.ref.kind === "bus" ? [item.ref.id] : item.ports.map(port=>port.busId) });
      }
    }
    function fit(ids) {
      const positions = dependencies.busCoordinates().positions;
      const points = ids.map(id => positions.get(id)).filter(Boolean);
      if (!points.length) return;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      points.forEach(([x,y]) => { minX = Math.min(minX,x); maxX = Math.max(maxX,x); minY = Math.min(minY,y); maxY = Math.max(maxY,y); });
      const camera = state.cameras.geo;
      camera.scale = Math.min(512, Math.max(1, Math.min(650 / Math.max(maxX-minX,1), 380 / Math.max(maxY-minY,1))));
      camera.x = 380 - (minX+maxX)/2*camera.scale; camera.y = 250 - (minY+maxY)/2*camera.scale;
      refresh();
    }
    function showMembers(ids) {
      memberRows = ids; memberPage = 0; renderMembers();
    }
    function renderMembers() {
      const target = document.getElementById("region-members"); if (!target) return;
      if (!memberRows.length) { target.innerHTML = ""; return; }
      const pages = Math.ceil(memberRows.length/50);
      target.innerHTML = `<h3>Grouped buses · ${memberRows.length.toLocaleString()} total</h3><p>Coordinates can overlap. Choose any bus to inspect its electrical model.</p>${memberRows.slice(memberPage*50,(memberPage+1)*50).map(id => `<button class="sheet-link" data-region-bus="${h(id)}">${h(id)}</button>`).join(" ")}<p><button data-member-prev ${memberPage ? "" : "disabled"}>Previous buses</button> Page ${memberPage+1} / ${pages} <button data-member-next ${memberPage+1 < pages ? "" : "disabled"}>Next buses</button> <button data-member-close>Close list</button></p>`;
      target.querySelectorAll("[data-region-bus]").forEach(button => button.onclick = () => dependencies.select({ kind: "bus", id: button.dataset.regionBus }));
      target.querySelector("[data-member-prev]").onclick = () => { memberPage--; renderMembers(); };
      target.querySelector("[data-member-next]").onclick = () => { memberPage++; renderMembers(); };
      target.querySelector("[data-member-close]").onclick = () => showMembers([]);
    }
    function renderLandmarkList() {
      const target = document.getElementById("region-landmark-list"); if (!target) return;
      if (!landmarkRows.length) { target.innerHTML = ""; return; }
      const pages=Math.ceil(landmarkRows.length/50);
      target.innerHTML=`<h3>Equipment & grounding · ${landmarkRows.length} entries</h3>${landmarkRows.slice(landmarkPage*50,(landmarkPage+1)*50).map((entry,i)=>`<button data-landmark-entry="${landmarkPage*50+i}">${h(entry.type)} · ${h(entry.item.ref.id)}${entry.type === "ground" ? ` · terminals ${h(entry.item.groundedTerminals.join(", "))}` : ""}</button>`).join(" ")}<p><button data-landmark-prev ${landmarkPage ? "" : "disabled"}>Previous equipment</button> Page ${landmarkPage+1} / ${pages} <button data-landmark-next ${landmarkPage+1<pages ? "" : "disabled"}>Next equipment</button> <button data-landmark-close>Close equipment list</button></p>`;
      target.querySelectorAll("[data-landmark-entry]").forEach(button=>button.onclick=()=>dependencies.select(landmarkRows[Number(button.dataset.landmarkEntry)].item.ref));
      target.querySelector("[data-landmark-prev]").onclick=()=>{landmarkPage--;renderLandmarkList();};
      target.querySelector("[data-landmark-next]").onclick=()=>{landmarkPage++;renderLandmarkList();};
      target.querySelector("[data-landmark-close]").onclick=()=>{landmarkRows=[];renderLandmarkList();};
    }
    const glyph = type => type === "source" ? '<path d="M0 -8L8 0 0 8 -8 0Z" fill="#fffdf9"/><path d="M-4 0Q-2 -5 0 0T4 0" fill="none"/>' : type === "transformer" ? '<circle cx="-4" cy="0" r="6" fill="#fffdf9"/><circle cx="4" cy="0" r="6" fill="#fffdf9"/>' : type === "open switch" ? '<path d="M-10 3H-5M5 3H10M-5 3L4 -5" fill="none"/><circle cx="-5" cy="3" r="1.5"/><circle cx="5" cy="3" r="1.5"/>' : '<path d="M0 -8V1M-8 1H8M-5 5H5M-2 9H2" fill="none"/>';

    function refresh() {
      if (!regional || !document.getElementById("region-map")) return;
      prepareRegion();
      const { positions, unmapped } = dependencies.busCoordinates(), camera = state.cameras.geo;
      const screen = point => [point[0]*camera.scale+camera.x, point[1]*camera.scale+camera.y];
      const visible = [], bins = new Map();
      for (const bus of state.index.buses) {
        const point = positions.get(bus.ref.id); if (!point) continue;
        const [x,y] = screen(point); if (x < 15 || x > 745 || y < 15 || y > 485) continue;
        visible.push({ bus, x, y });
        const key = `${Math.floor(x/50)}:${Math.floor(y/50)}`;
        if (!bins.has(key)) bins.set(key, []); bins.get(key).push({ bus, x, y });
      }
      const detailed = visible.length <= 300;
      let content = '<rect width="760" height="500" fill="#f3f6f4"/><path d="M20 470v-28m-5 8l5-8 5 8" stroke="#70695f" fill="none"/><text x="20" y="485" text-anchor="middle" font-size="10">N</text>';
      let edgeCount = 0, drawnEdges = 0;
      if (detailed) for (const item of state.index.assets) for (const connection of item.connections || []) {
        const pa=positions.get(connection.from.busId), pb=positions.get(connection.to.busId); if (!pa || !pb) continue;
        const route = dependencies.geometryPointsOf(item);
        const points = route.length >= 2 ? route.map(([lon,lat]) => screen(dependencies.busCoordinates().project(lon,lat))) : [screen(pa),screen(pb)];
        const xs=points.map(p=>p[0]), ys=points.map(p=>p[1]);
        if (Math.max(...xs)<0 || Math.min(...xs)>760 || Math.max(...ys)<0 || Math.min(...ys)>500) continue;
        edgeCount++; if (drawnEdges>=600) continue; drawnEdges++;
        const traced = state.terminalTrace?.assetPointers.has(item.ref.pointer);
        const selected = dependencies.sameRef(item.ref,state.selected), status=dependencies.resultStatus(item);
        const transformer=item.ref.kind === "transformer";
        content += `<polyline points="${points.map(p=>p.join(",")).join(" ")}" fill="none" stroke="${traced ? "#7739a6" : selected ? "#b34712" : transformer ? "#a25316" : "#64877b"}" stroke-width="${traced ? 4 : selected ? 4 : transformer ? 3 : 1.5}" ${status === "open" || status === "out_of_service" ? 'stroke-dasharray="5 4"' : ""} data-kind="${h(item.ref.kind)}" data-id="${h(item.ref.id)}"><title>${h(dependencies.titleOf(item))} · ${h(status)} · ${route.length >= 2 ? "supplied route" : "straight endpoint connection"}</title></polyline>`;
      }
      // Group close/coincident points even in detail mode so none covers another.
      cells = [...bins.values()];
      for (let i=0;i<cells.length;i++) {
        const entries=cells[i];
        if (detailed && entries.length <= 8 && new Set(entries.map(e=>`${e.x.toFixed(1)}:${e.y.toFixed(1)}`)).size === entries.length) {
          for (const {bus,x,y} of entries) {
            const selected=dependencies.sameRef(bus.ref,state.selected), traced=state.terminalTrace?.busIds.has(bus.ref.id);
            content += `<g role="button" tabindex="0" data-kind="bus" data-id="${h(bus.ref.id)}" aria-label="Inspect bus ${h(bus.ref.id)}"><circle cx="${x}" cy="${y}" r="${selected ? 8 : 4}" fill="${selected ? "#dbeafd" : "#fffdf9"}" stroke="${traced ? "#7739a6" : selected ? "#b34712" : "#2f6fb3"}" stroke-width="2"/><title>${h(bus.ref.id)} · network ${memberships.get(bus.ref.id)+1}</title></g>`;
          }
        } else {
          const x=Math.floor(entries[0].x/50)*50+25, y=Math.floor(entries[0].y/50)*50+25;
          const networks=new Set(entries.map(e=>memberships.get(e.bus.ref.id))).size;
          const traced = entries.some(e=>state.terminalTrace?.busIds.has(e.bus.ref.id));
          content += `<g role="button" tabindex="0" data-region-cell="${i}" aria-label="${entries.length} buses in ${networks} networks. Expand group"><circle cx="${x}" cy="${y}" r="20" fill="#fffdf9" stroke="${traced ? "#7739a6" : networks>1 ? "#b26c2a" : "#2f6fb3"}" stroke-width="2" ${networks>1 ? 'stroke-dasharray="3 2"' : ""}/><text x="${x}" y="${y+4}" text-anchor="middle" font-size="11" fill="#25231f">${entries.length}</text><title>${entries.length} buses · ${networks} separate networks. Geographic grouping does not join networks.</title></g>`;
        }
      }
      const landmarkBins=new Map(); visibleLandmarks=[];
      let unplacedLandmarks=0;
      for (const entry of landmarks) {
        const points=entry.ids.map(id=>positions.get(id)).filter(Boolean);
        if (!points.length || points.length !== entry.ids.length) { unplacedLandmarks++; continue; }
        const anchor=screen([points.reduce((v,p)=>v+p[0],0)/points.length, points.reduce((v,p)=>v+p[1],0)/points.length]);
        const [x,y]=anchor; if(x<15 || x>745 || y<15 || y>485) continue;
        const placed={...entry,x,y}; visibleLandmarks.push(placed);
        const key=`${Math.floor(x/50)}:${Math.floor(y/50)}`;
        if(!landmarkBins.has(key))landmarkBins.set(key,[]);landmarkBins.get(key).push(placed);
      }
      landmarkGroups=[...landmarkBins.values()];
      landmarkGroups.forEach((group,i)=>{
        if (detailed && group.length === 1) {
          const {item,type,x,y}=group[0];
          content+=`<g data-landmark-symbol="${h(type)}" data-kind="${h(item.ref.kind)}" data-id="${h(item.ref.id)}"><path d="M${x} ${y}l12 -12" stroke="#a6a098" stroke-dasharray="1 2"/><g transform="translate(${x+12} ${y-12})" stroke="${dependencies.sameRef(item.ref,state.selected) ? "#b34712" : "#403830"}" stroke-width="2">${glyph(type)}</g><title>${h(type)} · ${h(item.ref.id)} · ${h(item.status)}${type === "ground" ? ` · ideal ground terminals ${h(item.groundedTerminals.join(", "))}` : ""}</title></g>`;
        } else {
          const x=Math.floor(group[0].x/50)*50+25, y=Math.floor(group[0].y/50)*50+43;
          content+=`<g role="button" tabindex="0" data-landmark-cell="${i}" aria-label="Inspect ${group.length} equipment and grounding entries"><rect x="${x-18}" y="${y-7}" width="36" height="14" rx="3" fill="#403830"/><text x="${x}" y="${y+3}" text-anchor="middle" fill="white" font-size="9">◆ ${group.length}</text><title>${[...new Set(group.map(e=>e.type))].map(type=>`${group.filter(e=>e.type===type).length} ${type}`).join(" · ")}</title></g>`;
        }
      });
      const legend=document.getElementById("region-landmark-legend");
      legend.innerHTML=`<strong>Landmarks in view:</strong> ${["source","transformer","open switch","ground"].map(type=>`<button data-landmark-type="${type}"><svg viewBox="-12 -12 24 24" width="20" height="20" aria-hidden="true"><g stroke="currentColor" stroke-width="2">${glyph(type)}</g></svg>${type}: ${visibleLandmarks.filter(e=>e.type===type).length}</button>`).join(" ")}<p>${unplacedLandmarks} unplaced · ${landmarks.length-visibleLandmarks.length-unplacedLandmarks} outside viewport. Ground counts are buses with declared ideal-ground terminals. Equipment symbols are offset for legibility; dotted leaders are not wires. Transformer locations use the mean of their endpoint coordinates.</p>`;
      legend.querySelectorAll("[data-landmark-type]").forEach(button=>button.onclick=()=>{landmarkRows=visibleLandmarks.filter(e=>e.type===button.dataset.landmarkType);landmarkPage=0;renderLandmarkList();});
      document.querySelector("#region-map #viewport").innerHTML = content;
      const grouped = cells.filter(entries => !(detailed && entries.length <= 8 && new Set(entries.map(e=>`${e.x.toFixed(1)}:${e.y.toFixed(1)}`)).size === entries.length)).reduce((n,e)=>n+e.length,0);
      document.getElementById("region-evidence").textContent = `${visible.length.toLocaleString()} buses in viewport · ${grouped.toLocaleString()} grouped · ${(state.index.buses.length-unmapped.length-visible.length).toLocaleString()} outside viewport · ${unmapped.length.toLocaleString()} without coordinates. ${detailed ? `${drawnEdges}/${edgeCount} intersecting connections drawn.` : "Connections appear at closer zoom."} Zoom ${camera.scale.toFixed(1)}×.${state.terminalTrace ? " Purple equipment/groups contain traced terminals. The map highlights equipment, not individual conductors; read the trace for terminal identities and stops." : ""}`;
      dependencies.bindSvgSelection();
      document.querySelectorAll("[data-landmark-cell]").forEach(node=>{
        const activate=()=>{landmarkRows=landmarkGroups[Number(node.dataset.landmarkCell)];landmarkPage=0;renderLandmarkList();};
        node.onclick=activate;node.onkeydown=event=>{if(event.key === "Enter" || event.key === " "){event.preventDefault();activate();}};
      });
      document.querySelectorAll("[data-region-cell]").forEach(node => {
        const activate = () => {
          const entries=cells[Number(node.dataset.regionCell)], ids=entries.map(e=>e.bus.ref.id);
          showMembers(ids);
          if (camera.scale < 512) {
            const x=entries.reduce((v,e)=>v+e.x,0)/entries.length, y=entries.reduce((v,e)=>v+e.y,0)/entries.length;
            const factor=Math.min(2,512/camera.scale); camera.x=380-(x-camera.x)*factor; camera.y=250-(y-camera.y)*factor; camera.scale*=factor; refresh();
          }
        };
        node.onclick=activate; node.onkeydown=event=>{if(event.key === "Enter" || event.key === " "){event.preventDefault();activate();}};
      });
      setStatus(`Regional map · ${state.index.coordinateCount.toLocaleString()} placed buses · ${state.index.componentCount.toLocaleString()} separate network${state.index.componentCount === 1 ? "" : "s"}. Geographic proximity is not electrical connectivity.`);
    }
    let frame = null;
    function scheduleRefresh() {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => { frame = null; refresh(); });
    }
    function drawGeo() {
      regional = dependencies.busCoordinates().geographic;
      if (!regional) { drawLegacyGeo(); return; }
      prepareRegion();
      const transformerCount=state.index.counts.transformer || 0;
      const multiWindingCount=state.index.assets.filter(item => item.ref.kind === "transformer" && item.ports.length > 2).length;
      const coordinates=state.index.raw.meta?.coordinates;
      const placement=coordinates?.coordinate_space || state.index.raw.meta?.coordinate_provenance;
      const provenance = placement ? `<p class="region-provenance"><strong>Coordinate provenance:</strong> ${h(typeof placement === "string" ? placement : JSON.stringify(placement))}${coordinates?.geographic_anchor?.label ? ` · anchor: ${h(coordinates.geographic_anchor.label)}` : ""}</p>` : "";
      setCanvas(`<section class="regional-map"><header><h2>Regional connectivity</h2><p><strong>${state.index.componentCount.toLocaleString()} connected network${state.index.componentCount === 1 ? "" : "s"}</strong> · ${transformerCount.toLocaleString()} transformer models supplied · ${(state.index.counts.voltage_source || 0).toLocaleString()} voltage source${state.index.counts.voltage_source === 1 ? "" : "s"}</p><p>${transformerCount ? "Transformer links follow the supplied model." : "No transformer models supplied; MV/LV bridges are not inferred."} ${multiWindingCount ? `${multiWindingCount} multi-winding transformer models: inspect their winding connections in Electrical detail. ` : ""}Dashed amber groups contain multiple separate networks. Group outlines represent geographic aggregation, not electrical boundaries.</p><button id="region-reset">Show entire region</button> <button id="region-network" ${state.selected ? "" : "disabled"}>Fit selected network</button></header>${provenance}<div id="region-map">${svgShell("", { camera: { scale:1,x:0,y:0 } })}</div><div id="region-landmark-legend"></div><div id="region-landmark-list"></div><p id="region-evidence" role="status"></p><p class="muted">Uses supplied latitude/longitude in a local aspect-preserving projection. North is up. Straight links connect model endpoints; supplied route geometry is retained. No basemap or coordinate accuracy is implied. Select a bus or branch for its source evidence and conductor model.</p><div id="region-members"></div></section>`);
      document.getElementById("region-reset").onclick=()=>{state.cameras.geo={scale:1,x:0,y:0}; showMembers([]); refresh();};
      document.getElementById("region-network").onclick=()=>{
        const selected=state.index.byKind.get(state.selected?.kind)?.get(state.selected?.id);
        const busId=selected?.ref.kind === "bus" ? selected.ref.id : selected?.ports[0]?.busId;
        const network=state.index.components[memberships.get(busId)]; if(network) fit(network.busIds);
      };
      refresh(); renderMembers(); renderLandmarkList();
    }

    return Object.freeze({ MODULE_VERSION, drawGeo, refresh, scheduleRefresh, isRegional: () => regional });
  }

  globalThis.BMOPFRenderers = Object.freeze({ ...(globalThis.BMOPFRenderers || {}), MODULE_VERSION, createGeospatialRenderer });
})();
