(function () {
  "use strict";

  const MODULE_VERSION = "multi-wire-projection-v1";

  function createMultiWireProjection(dependencies) {
    const escapeHtml = dependencies.escapeHtml;
    const findBus = dependencies.findBus;

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
      let html = `<g data-kind="bus" data-id="${escapeHtml(bus.ref.id)}"><rect x="${x}" y="${y}" width="${width}" height="${Math.max(190, 112 + terminals.length * 34)}" rx="8" fill="#fffdf9" stroke="#2f6fb3" stroke-width="2"/><text x="${x + width / 2}" y="${y + 28}" text-anchor="middle" fill="#25231f" font-size="14">bus ${escapeHtml(bus.ref.id)}</text>`;
      terminals.forEach((terminal, i) => {
        const grounded = (bus.groundedTerminals || []).includes(terminal) || /^(g|pe|ground|earth)$/i.test(terminal);
        const label = grounded ? `${terminal} · ⏚` : terminal;
        const lineStart = side === "left" ? x + width - 18 : x + 18;
        const textX = side === "left" ? x + 14 : x + width - 14;
        html += `<line x1="${lineStart}" y1="${rowY[i]}" x2="${side === "left" ? x + width - 4 : x + 4}" y2="${rowY[i]}" stroke="${grounded ? "#5d574d" : "#9a9388"}" stroke-width="${grounded ? 3 : 2}"${grounded ? " stroke-dasharray=\"2 4\"" : ""}/><text x="${textX}" y="${rowY[i] + 4}" text-anchor="${side === "left" ? "start" : "end"}" fill="#37332c" font-size="12">${escapeHtml(label)}</text>`;
      });
      html += `</g>`;
      return { html, rowY };
    }

    function multiWindingPanel(bus, port, x, y, width, side) {
      const terminals = terminalNames(port);
      const height = side === "top" ? 92 : Math.max(150, 78 + terminals.length * 28);
      const anchors = [];
      let html = `<g data-kind="bus" data-id="${escapeHtml(bus.ref.id)}"><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="8" fill="#fffdf9" stroke="#2f6fb3" stroke-width="2"/><text x="${x + width / 2}" y="${y + 24}" text-anchor="middle" fill="#25231f" font-size="13">bus ${escapeHtml(bus.ref.id)}</text>`;
      terminals.forEach((terminal, i) => {
        const grounded = (bus.groundedTerminals || []).includes(terminal) || /^(g|pe|ground|earth)$/i.test(terminal);
        const label = grounded ? `${terminal} · ⏚` : terminal;
        if (side === "top") {
          const point = terminals.length === 1 ? x + width / 2 : x + 24 + i * ((width - 48) / (terminals.length - 1));
          anchors.push([point, y]);
          html += `<line x1="${point}" y1="${y}" x2="${point}" y2="${y + 15}" stroke="${grounded ? "#5d574d" : "#9a9388"}" stroke-width="${grounded ? 3 : 2}"${grounded ? " stroke-dasharray=\"2 4\"" : ""}/><text x="${point}" y="${y + 39}" text-anchor="middle" fill="#37332c" font-size="11">${escapeHtml(label)}</text>`;
        } else {
          const rowY = y + 54 + i * 28;
          const lineStart = side === "left" ? x + width - 18 : x + 18;
          const lineEnd = side === "left" ? x + width - 4 : x + 4;
          anchors.push([lineEnd, rowY]);
          html += `<line x1="${lineStart}" y1="${rowY}" x2="${lineEnd}" y2="${rowY}" stroke="${grounded ? "#5d574d" : "#9a9388"}" stroke-width="${grounded ? 3 : 2}"${grounded ? " stroke-dasharray=\"2 4\"" : ""}/><text x="${side === "left" ? x + 12 : x + width - 12}" y="${rowY + 4}" text-anchor="${side === "left" ? "start" : "end"}" fill="#37332c" font-size="11">${escapeHtml(label)}</text>`;
        }
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
