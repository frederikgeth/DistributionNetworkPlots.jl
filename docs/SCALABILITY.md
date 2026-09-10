# Large-case investigation (2026-09-10)

The Springfield MV/LV review file was tested locally; it is not included in this repository.
It is 31,298,058 bytes (29.85 MiB), with 692,476 JSON values, depth 5,
24,385 buses, 22,267 lines, 7,788 loads, 2,174 voltage sources and two linecodes.
All buses have coordinates. It contains no transformers or operating results.

The original importer rejected it at 25 MiB; its 100,000-value limit would also reject it.
A standalone Node probe measured the original index build at 4.67 seconds.
Bus-reference validation was scanning every bus for every port.

Changes:

- Imports allow 64 MiB / 2,000,000 values, including result and model comparisons.
  Counting wide arrays no longer uses a spread call that can overflow argument limits.
- Bus and kind/ID maps replace repeated linear lookups in indexing and interpretation.
- Search renders 100 matches per page, with total counts, paging and keyboard access to every match.
- Large cases use a validated root-bus text input instead of rebuilding thousands of option nodes.
- Focused single-line diagrams lay out only the neighbourhood and its boundary endpoints.
- Separate topology components are counted visibly. This is structural connectivity,
  including open/out-of-service branches, not an energisation or power-flow analysis.
- Schema and frequency are read from BMOPF `meta.$schema` and `meta.frequency`,
  with legacy top-level fallback.

A local headless Chromium run after these changes measured 306 ms file selection to
loaded summary, 116 ms indexing, 46 ms broad search, and 45 ms selection to detail.
These are individual observations on this machine, not cross-device guarantees.
The last selected line sheet had about 1,000 DOM nodes and 40 SVG descendants.
The remaining import task blocked the main thread for about 286 ms.
All 56,614 assets passed the existing electrical interpreter's checks; this is not
full JSON Schema validation or proof that the case is solvable.

The supplied topology has 2,174 separate components; the largest has 650 buses.
Its metadata also declares zero transformer bridges. Missing MV/LV transformer
connections cannot be recovered by a renderer. No connections were invented.

## Reproduce

With Node and the repository's Playwright dependency available:

```sh
node scripts/profile-large-case.mjs /path/to/case.bmopf.json
npm run test:build
npm run test:browser
```

The browser probe checks import, bounded search, paging, focused single-line and
selected bus/line model sheets. It records long tasks and errors and writes a
screenshot to `/tmp/bmopf-large-case.png`. It does not render the entire Springfield
network at once. Existing browser tests also import a synthetic file above 25 MiB
and 100,000 values, including a wide array, without requiring private case data.

## Rendering architecture and next work

Live views use SVG and HTML. Only PNG export uses a Canvas 2D context. There is no
WebGL/WebGPU renderer or GPU graph-layout implementation. Browser-internal
compositing/rasterisation may use hardware, but these tests do not establish actual
hardware GPU usage, and it does not remove JavaScript, DOM or graph-layout costs.

Keep SVG/HTML for precise, accessible model sheets and export. For a whole-region
overview, implement viewport culling and a hierarchy of components/feeders with
visible counts and explicit drill-down. A WebGL overview could then batch visible
lines and nodes; WebGL offers hardware acceleration where supported
([MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API)).

Move parsing/indexing and expensive layout into workers to remove remaining import
pauses ([MDN workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers)).
Worker packaging must support both the static app and self-contained Julia reports.
Full-network SVG, force layout, high-degree neighbourhoods, large result/diagnostic
tables and many pinned sheets remain scaling limits. Raising import limits is not
a claim that those unbounded views are now fast. No GPU engine or worker was added
in this change.
