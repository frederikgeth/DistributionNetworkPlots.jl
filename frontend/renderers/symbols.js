(function () {
  "use strict";

  const MODULE_VERSION = "symbols-renderer-v1";

  function createSymbolRenderer(dependencies) {
    const escapeHtml = dependencies.escapeHtml;
    const colourOf = dependencies.colourOf;
    const sameRef = dependencies.sameRef;
    const resultStatus = dependencies.resultStatus;
    const resultTooltip = dependencies.resultTooltip;
    const titleOf = dependencies.titleOf;

    function singleSymbol(item, x, y, selectedRef) {
      const colour = colourOf(item.ref.kind);
      const selected = sameRef(item.ref, selectedRef);
      const status = resultStatus(item);
      const opacity = status === "out_of_service" ? .35 : 1;
      const width = selected ? 3 : 2;
      const dash = status === "open" ? ` stroke-dasharray="4 3"` : "";
      let shape;
      switch (item.ref.kind) {
        case "switch": {
          const bladeY = status === "open" ? -10 : 0;
          shape = `<circle cx="-13" cy="0" r="2.5" fill="#fffdf9" stroke="${colour}" stroke-width="${width}"/><circle cx="13" cy="0" r="2.5" fill="#fffdf9" stroke="${colour}" stroke-width="${width}"/><path d="M-13 0h7M6 ${bladeY}h7M-6 0L6 ${bladeY}" fill="none" stroke="${colour}" stroke-width="${width}"${dash}/>`;
          break;
        }
        case "transformer": shape = `<path d="M-18 0h6M12 0h6" stroke="${colour}" stroke-width="${width}"/><circle cx="-6" cy="0" r="8" fill="#fffdf9" stroke="${colour}" stroke-width="${width}"/><circle cx="6" cy="0" r="8" fill="#fffdf9" stroke="${colour}" stroke-width="${width}"/>`; break;
        case "voltage_source": shape = `<circle cx="0" cy="0" r="12" fill="#fffdf9" stroke="${colour}" stroke-width="${width}"/><text x="0" y="4" text-anchor="middle" font-size="13" fill="${colour}">~</text>`; break;
        case "load": shape = `<rect x="-12" y="-9" width="24" height="18" rx="2" fill="#fffdf9" stroke="${colour}" stroke-width="${width}"/><path d="M-5 0h10M2-4l4 4-4 4" fill="none" stroke="${colour}" stroke-width="${Math.max(1.5, width - .5)}"/>`; break;
        case "generator": shape = `<circle cx="0" cy="0" r="11" fill="#fffdf9" stroke="${colour}" stroke-width="${width}"/><text x="0" y="4" text-anchor="middle" font-size="9" fill="${colour}">G</text>`; break;
        case "ibr": shape = `<circle cx="0" cy="0" r="11" fill="#fffdf9" stroke="${colour}" stroke-width="${width}"/><text x="0" y="3" text-anchor="middle" font-size="7" fill="${colour}">IBR</text>`; break;
        case "capacitor": shape = `<path d="M0-18v8M0 10v8M-8-10h16M-8 10h16" stroke="${colour}" stroke-width="${width}"/>`; break;
        case "shunt": shape = `<path d="M0-15v10M-9-5h18M-6 1h12M-3 7h6" stroke="${colour}" stroke-width="${width}"/>`; break;
        default: shape = `<rect x="-10" y="-7" width="20" height="14" rx="3" fill="#fffdf9" stroke="${colour}" stroke-width="${width}"${dash}/>`;
      }
      return `<g transform="translate(${x} ${y})" opacity="${opacity}" data-kind="${escapeHtml(item.ref.kind)}" data-id="${escapeHtml(item.ref.id)}"><title>${escapeHtml(titleOf(item))} · ${escapeHtml(status)}${escapeHtml(resultTooltip(item))}</title>${shape}<text x="0" y="27" text-anchor="middle" fill="#37332c" font-size="9">${escapeHtml(item.ref.id)}</text></g>`;
    }

    return Object.freeze({ MODULE_VERSION, singleSymbol });
  }

  globalThis.BMOPFRenderers = Object.freeze({ MODULE_VERSION, createSymbolRenderer });
})();
