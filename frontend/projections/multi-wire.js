(function () {
  "use strict";

  const MODULE_VERSION = "multi-wire-projection-v1";

  function createMultiWireProjection(dependencies) {
    const escapeHtml = dependencies.escapeHtml;
    const findBus = dependencies.findBus;
    const entityLabelSvg = dependencies.entityLabelSvg || ((kind, id) => `${escapeHtml(kind)} ${escapeHtml(id)}`);

    function conductorVisual(terminal, otherTerminal, busId, otherBusId, index) {
      const name = String(terminal).toLowerCase();
      const otherName = String(otherTerminal).toLowerCase();
      const bus = findBus(busId);
      const otherBus = findBus(otherBusId);
      const grounded = Boolean(bus?.groundedTerminals?.includes(String(terminal)) || otherBus?.groundedTerminals?.includes(String(otherTerminal)) || /^(g|pe|ground|earth)$/.test(name) || /^(g|pe|ground|earth)$/.test(otherName));
      const neutral = name === "n" || name === "neutral" || otherName === "n" || otherName === "neutral";
      if (grounded && neutral) return { colour: "#5d574d", dash: "4 3", label: "N⏚", kind: "grounded neutral" };
      if (grounded) return { colour: "#5d574d", dash: "2 4", label: "⏚", kind: "ground" };
      if (neutral) return { colour: "#787266", dash: "10 5", label: "N", kind: "neutral" };
      const phaseIndex = { a: 0, p1: 0, phase1: 0, "1": 0, b: 1, p2: 1, phase2: 1, "2": 1, c: 2, p3: 2, phase3: 2, "3": 2 }[name] ?? { a: 0, p1: 0, phase1: 0, "1": 0, b: 1, p2: 1, phase2: 1, "2": 1, c: 2, p3: 2, phase3: 2, "3": 2 }[otherName] ?? index % 3;
      return { colour: ["#c2564b", "#4a8f5f", "#3f6fb9"][phaseIndex], dash: "", label: ["A", "B", "C"][phaseIndex], kind: "phase" };
    }

    function terminalNames(port) {
      return port?.terminals?.length ? port.terminals.map(String) : ["? (terminal map unavailable)"];
    }

    function multiBusPanel(bus, port, x, y, width, side) {
      const terminals = terminalNames(port);
      const rowY = terminals.map((_, i) => y + 72 + i * 34);
      const spineX = side === "left" ? x + width : x;
      const labelX = side === "left" ? spineX - 10 : spineX + 10;
      const labelAnchor = side === "left" ? "end" : "start";
      const lineEnd = rowY[rowY.length - 1] + 10;
      let html = `<g data-kind="bus" data-id="${escapeHtml(bus.ref.id)}"><title>bus ${escapeHtml(bus.ref.id)} · ${terminals.length} terminals</title><text x="${spineX}" y="${y + 24}" text-anchor="middle" fill="#25231f" font-size="14">${entityLabelSvg("bus", bus.ref.id)}</text><line x1="${spineX}" y1="${y + 42}" x2="${spineX}" y2="${lineEnd}" stroke="#2f6fb3" stroke-width="2" stroke-dasharray="2 5"/>`;
      terminals.forEach((terminal, i) => {
        const grounded = (bus.groundedTerminals || []).includes(terminal) || /^(g|pe|ground|earth)$/i.test(terminal);
        const label = grounded ? `${terminal} · ⏚` : terminal;
        html += `<circle cx="${spineX}" cy="${rowY[i]}" r="4" fill="#fffdf9" stroke="${grounded ? "#5d574d" : "#2f6fb3"}" stroke-width="2"/><text x="${labelX}" y="${rowY[i] + 4}" text-anchor="${labelAnchor}" fill="#37332c" font-size="12">${escapeHtml(label)}</text>`;
      });
      html += `</g>`;
      return { html, rowY };
    }

    function multiWindingPanel(bus, port, x, y, width, side) {
      const terminals = terminalNames(port);
      const anchors = [];
      const spineX = side === "left" ? x + width : side === "right" ? x : x + width / 2;
      const labelX = side === "right" ? spineX + 10 : side === "left" ? spineX - 10 : spineX + 10;
      const labelAnchor = side === "right" ? "start" : side === "left" ? "end" : "start";
      const rowY = terminals.map((_, i) => side === "top" ? y + 42 + i * 24 : y + 54 + i * 28);
      const lineStart = side === "top" ? y + 28 : y + 38;
      const lineEnd = rowY[rowY.length - 1] + 9;
      let html = `<g data-kind="bus" data-id="${escapeHtml(bus.ref.id)}"><title>bus ${escapeHtml(bus.ref.id)} · ${terminals.length} terminals</title><text x="${spineX}" y="${y + 20}" text-anchor="middle" fill="#25231f" font-size="13">${entityLabelSvg("bus", bus.ref.id)}</text><line x1="${spineX}" y1="${lineStart}" x2="${spineX}" y2="${lineEnd}" stroke="#2f6fb3" stroke-width="2" stroke-dasharray="2 5"/>`;
      terminals.forEach((terminal, i) => {
        const grounded = (bus.groundedTerminals || []).includes(terminal) || /^(g|pe|ground|earth)$/i.test(terminal);
        const label = grounded ? `${terminal} · ⏚` : terminal;
        anchors.push([spineX, rowY[i]]);
        html += `<circle cx="${spineX}" cy="${rowY[i]}" r="3.5" fill="#fffdf9" stroke="${grounded ? "#5d574d" : "#2f6fb3"}" stroke-width="1.8"/><text x="${labelX}" y="${rowY[i] + 4}" text-anchor="${labelAnchor}" fill="#37332c" font-size="11">${escapeHtml(label)}</text>`;
      });
      html += `</g>`;
      return { html, anchors };
    }

    function focusedPath(points, visual, status) {
      const dash = [visual.dash, status === "open" ? "8 6" : ""].filter(Boolean).join(" ");
      return `<path d="M${points.map((point) => `${point[0]} ${point[1]}`).join("L")}" fill="none" stroke="${visual.colour}" stroke-width="3"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
    }

    function matrixValue(record, prefix, row, column) {
      if (!record || typeof record !== "object") return null;
      const key = `${prefix}_${row + 1}_${column + 1}`;
      const direct = record[key];
      if (direct !== null && direct !== undefined && direct !== "" && Number.isFinite(Number(direct))) return Number(direct);
      const matrix = record[prefix] || record[prefix.toLowerCase()];
      const nested = Array.isArray(matrix) && Array.isArray(matrix[row]) ? matrix[row][column] : undefined;
      if (nested !== null && nested !== undefined && nested !== "" && Number.isFinite(Number(nested))) return Number(nested);
      const keyed = matrix && typeof matrix === "object" ? matrix[key] : undefined;
      if (keyed !== null && keyed !== undefined && keyed !== "" && Number.isFinite(Number(keyed))) return Number(keyed);
      return null;
    }

    function branchModel(item, connection, findRecord) {
      const record = item?.sourceRecord || {};
      const linecode = record.linecode && findRecord ? findRecord({ kind: "linecode", id: record.linecode }) : null;
      const source = linecode?.sourceRecord || record;
      const fromCode = Boolean(linecode?.sourceRecord);
      const length = Number(record.length);
      const scale = fromCode && Number.isFinite(length) ? length : 1;
      const count = Math.max(1, connection?.pairs?.length || item?.ports?.[0]?.terminals?.length || 1);
      const series = Array.from({ length: count }, (_, row) => Array.from({ length: count }, (_, column) => ({
        r: matrixValue(source, "R_series", row, column),
        x: matrixValue(source, "X_series", row, column)
      })).map((entry) => ({ r: entry.r === null ? null : entry.r * scale, x: entry.x === null ? null : entry.x * scale })));
      const shunt = { from: [], to: [] };
      for (const side of ["from", "to"]) {
        shunt[side] = Array.from({ length: count }, (_, row) => Array.from({ length: count }, (_, column) => ({
          g: matrixValue(source, `G_${side}`, row, column),
          b: matrixValue(source, `B_${side}`, row, column)
        })).map((entry) => ({ g: entry.g === null ? null : entry.g * scale, b: entry.b === null ? null : entry.b * scale })));
      }
      const shuntPresent = shunt.from.flat().concat(shunt.to.flat()).some((entry) => [entry.g, entry.b].some((value) => value !== null && Math.abs(value) > 1e-12));
      return { series, shunt, shuntPresent, source: fromCode ? `linecode ${record.linecode} · ${Number.isFinite(length) ? `L = ${length} m` : "length unavailable"}` : "inline absolute values" };
    }

    return Object.freeze({ MODULE_VERSION, conductorVisual, terminalNames, multiBusPanel, multiWindingPanel, focusedPath, branchModel });
  }

  globalThis.BMOPFProjections = Object.freeze({ MODULE_VERSION, createMultiWireProjection });
})();
