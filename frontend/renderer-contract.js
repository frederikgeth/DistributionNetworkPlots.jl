(function () {
  "use strict";

  // Small runtime contract shared by static renderers. Keeping this separate
  // lets the prototype move into packaged renderer modules without changing
  // the selection and SVG-export conventions.
  const VERSION = "renderer-contract-v1";

  function assetRef(node) {
    if (!node?.dataset?.kind || !node?.dataset?.id) return null;
    return { kind: node.dataset.kind, id: node.dataset.id };
  }

  function svgShell(content, options) {
    const camera = options?.camera || { x: 0, y: 0, scale: 1 };
    const view = String(options?.view || "view");
    const escapeHtml = typeof options?.escapeHtml === "function" ? options.escapeHtml : (value) => String(value);
    return `<svg viewBox="0 0 760 500" role="img" aria-label="${escapeHtml(view)} view"><g id="viewport" transform="translate(${camera.x} ${camera.y}) scale(${camera.scale})">${content}</g></svg>`;
  }

  globalThis.BMOPFRendererContract = Object.freeze({ VERSION, assetRef, svgShell });
})();
