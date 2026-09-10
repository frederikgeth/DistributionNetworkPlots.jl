# Large-case scalability (2026-09-10)

The current implementation includes worker imports and a paginated network directory.
The first sections record the initial investigation; the final section describes
the subsequent worker implementation and its measurements.

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

## Worker imports and network directory (subsequent branch work)

`frontend/importer.js` now handles case, dropped file, result, result comparison,
and model comparison imports. Parsing, value/depth checks, indexing, component
summaries and graph-signature preparation execute in a local Blob worker. The
worker source comes from the same model implementation used by the app; there
is no fetched worker script or second independent indexing implementation.

Raw tables, components and index entries transfer in acknowledged batches of at
most 500 entries. Sending the entire indexed graph in one structured-clone message
still caused a 256 ms receiving-thread pause; batching removed that pause for the
Springfield case. This bounds entry count per message, not bytes in an individual
entry. Extremely large individual arrays/strings can still cause a transfer pause.
The main thread reconstructs the maps and restores source-record identity.

Imports show progress and a cancel button. Starting another main import cancels
the previous one; switching cases also cancels it. Cancelled, failed or stale
imports do not replace the current case. Worker-unavailable environments have an
explicit main-thread fallback; asynchronous worker/CSP failures report an error.
Workers and Blob URLs are cleaned up on success, failure and cancellation.

A subsequent local Chromium probe recorded 564 ms total import, 154 ms worker
index/signature preparation, 43 ms broad search and 46 ms detail selection. No
main-thread tasks above 50 ms were observed in that run. Total import time is
longer than the earlier synchronous run, while responsiveness improves. These
are observations, not timing assertions in CI or guarantees for all hardware.

Large cases now open a directory of connected networks, with 25 cards per page,
bus/device/source counts, and search by any member bus ID. Every component remains
reachable. Selecting a card opens its source neighbourhood (or a member bus if no
source is supplied); it does not silently draw a whole component or infer a bridge.
Layout controls and the floating legend are hidden while showing the directory.
Force and ELK layout act on the focused neighbourhood when one is selected.
Saved positions outside that scope no longer inflate its canvas bounds. Whole-case
layout signatures are cached and prepared in the import worker.

Validation includes worker/raw/index identity, malformed and deeply nested JSON,
wide arrays, cancellation, overlapping imports, fallback, model/result imports,
component pagination/search, focused force layout, source and built static apps
opened via `file://`, and a generated Julia report opened from disk. Initial data
already embedded in a Julia report still uses synchronous startup indexing; file
imports inside that report use the worker. Full-region GPU rendering, viewport
culling, large diagnostics/results tables and unbounded pinned sheets remain
future work. No GPU renderer was added.

## Regional connectivity map (2026-09-11)

The Geospatial view now opens the entire placed region independently of the
single-line overview budget. It uses supplied bus latitude/longitude, caches a
local aspect-preserving projection, and corrects the previous bounds calculation
that incorrectly included zero longitude/latitude. Missing/null/boolean/out-of-range
coordinates are not plotted as geographic zero. Local x/y values remain in source
records; the renderer uses the supplied latitude/longitude when both are present.
ENWL's declared coordinate space and geographic anchor are shown as provenance.
This is local geographic visualisation, not a surveyed basemap or global projection.

At wide zoom, 50-unit screen cells aggregate buses. Markers sit at cell centres to
avoid overlapping counts; they are geographic groups, not equipment positions.
Dashed amber groups contain multiple separate structural networks. Clicking or
keyboard-activating a group zooms in and opens all members in pages of 50, including
buses with exactly coincident coordinates. Zoom is anchored at the mouse position;
pan/zoom redraws are scheduled once per animation frame. Region reset and fitting
the selected electrical network are explicit controls.

When at most 300 buses are in the viewport, individual buses and up to 600
intersecting two-port connections are drawn. Exact displayed/total connection counts
and grouped/off-screen/unplaced bus counts remain visible. Dense groups still
expand through their member lists. Routed geometry is used when supplied; other
links are straight endpoint connections. Open/out-of-service paths are dashed.
Transformer-model and source counts remain visible; missing transformer bridges
are never invented from nearby coordinates. Multi-winding models are explicitly
flagged for inspection in the electrical sheets rather than drawn as direct links.
This map currently shows topology, not a voltage/loading colour layer.

Validation used Springfield and all 25 individual JSON cases in the ENWL archive.
All 26 loaded and passed geographic-spread, bounded-SVG and group/member/network
navigation checks without browser errors. Springfield's initial map contained 137
SVG descendants for 24,385 buses; the ENWL checks used 57–706 descendants. The cases
were inspected separately, not merged or uploaded. Private case files are excluded
from the repository. Reproduce with:

```sh
node scripts/check-regional-cases.mjs /path/to/springfield.bmopf.json /path/to/extracted-enwl-json
node --test test/regional_browser.mjs
```

The regional regression fixture covers coincident coordinates, multiple networks
at the same location, missing coordinates, provenance, keyboard group expansion,
member pagination, selection, fitting and reset. The map continues to use SVG;
no WebGL/WebGPU dependency was added. GPU rendering of all regional branches and
operating-value overlays remain separate future work.

## Equipment landmarks and map detail panel

The regional map now includes distinct glyphs for voltage sources, transformers,
open switches and buses with explicitly grounded terminals. At wide zoom, or when
several landmarks share a screen cell, an equipment-count badge opens a list with
50 entries per page. Per-type viewport counts are clickable, and off-screen and
unplaced counts remain visible. Individual symbols appear at closer zoom for cells
with one landmark. Grounding entries count buses, with terminal IDs in the entry;
they do not imply that every terminal is grounded. Voltage sources are the source
landmarks; generators/IBRs are not reclassified as voltage-source models.

Symbols are offset from their geographic anchor for legibility. Dotted leaders are
placement guides, not electrical connections. Transformer anchors use the mean of
all supplied endpoint positions, and transformers with missing endpoint positions
are reported as unplaced. This is a schematic device location, not a surveyed
transformer position. Equipment-count lists retain every member despite overlap.

Selecting an element in Geospatial opens a compact resizable panel alongside the
map (below it on narrow screens). It displays ports, terminal order, grounding,
ratings/nominal values including inherited linecode ratings, source paths, operating
values with their units/references and case/result pairing, and interpreter warnings.
Uninterpreted-field counts remain visible. The compact panel shows up to 12 result
fields and 8 uninterpreted fields, explicitly counting the remainder and linking to
the full electrical sheet. Zero remains distinct from missing data. Full-view/back,
collapse/reopen and bus navigation are supported.

Validation covers all four landmark types, selection from equipment lists, zero
operating values, unknown fields, panel/full-sheet/back navigation, collapsing,
legend sizing and a 390-pixel mobile viewport. Springfield and all 25 ENWL cases
were rechecked with landmarks enabled, without browser errors; Springfield's initial
map used 269 SVG descendants. No private case files were added to the repository.

## Terminal-level connection traces

Choose a terminal in the compact Geospatial detail panel to start a trace. The
engine follows explicit, bijective line/switch terminal-map entries in either
direction, records terminal renaming and all reachable branches, and terminates
loops. It never joins buses merely because their terminal labels match. It does
not cross between the terminals of an attached load, source or other device.

Open/out-of-service devices, invalid switch-open states, ideal-ground terminals,
missing or duplicated bus terminals, unequal/duplicate maps and unsupported branch
models stop continuation. Transformer boundaries list related winding ports and
configurations without asserting conductor continuity through magnetic coupling.
Undeclared/unrecognised service states are labelled structural mappings only.
This is not a power-flow direction, protection reach or energisation analysis.

Purple map equipment/group outlines indicate that they contain traced terminals;
they do not depict individual conductors. Exact bus/terminal identities, stops,
source JSON pointers and selectable asset links appear in the adjacent trace list.
The trace survives selecting another asset or visiting its full electrical sheet,
and clears when the case changes or the user selects Clear trace.

Lists render 50 evidence entries per page. Traversal initially inspects at most
2,000 bus terminals / 20,000 incident assets, marks incomplete traces explicitly,
and allows doubling the budget up to 64,000 terminals. The budget is an operational
limit, not an inferred endpoint. Increasing it recomputes from the origin.

Regression tests cover renaming, cycles, branching boundaries, grounding, open
switches, transformer windings, ambiguous maps, device isolation, budget exhaustion,
map highlighting, evidence navigation, full-sheet/back, clearing and pagination.
A first-terminal trace from every Springfield component root completed within the
default budget: 2,174 traces, largest 650 terminals, about 93 ms total in a local
Node probe (not a cross-device performance guarantee).

### Operating-value colour layers

The regional map offers terminal-voltage magnitude (V), absolute reported voltage deviation (p.u.) and branch loading (p.u.). The legend always identifies the result, selected scenario, pairing state and coverage. Magnitude uses a case/scenario-wide range that stays fixed while panning; deviation and loading use fixed display ranges of 0–0.1 and 0–1.2 respectively. These are colour scales, not engineering acceptance limits. Groups show maximum available values and element coverage; dots mark incomplete coverage, and hatching marks unavailable values. A case identity mismatch suppresses numeric colours while retaining labelled evidence.

Operating metrics are cached by case, result object, scenario and layer. Incident branches are indexed by bus and deduplicated within each group. Evidence is sorted once and paginated at 50 elements, including unplaced elements and explicit reasons for unavailable values. Existing geographic grouping and connection limits remain in effect. Rendering continues to use SVG, without a WebGL/WebGPU renderer.

Only finite numeric results are accepted: zero remains data, while null, booleans, strings and misaligned voltage arrays do not become valid values. Keyed bus magnitudes follow the BMOPFTools phase-to-ground convention; flat arrays retain an undeclared reference unless supplied. Deviation requires a declared voltage reference and a reported deviation; no nominal-voltage inference is made. Loading accepts reported p.u. loading with an unverified-rating-basis label, or derives line loading from both ends' keyed `cm_fr`/`cm_to` currents and exact-length, positive `i_max` conductor ratings (case override, otherwise linecode). Other equipment requires reported loading. Partial end/terminal coverage is retained and labelled.

Validation: 14 build/model tests, all five browser suites and 68 Julia assertions pass. Browser tests cover zero/missing values, incompatible arrays, current/rating evidence, grouping, pagination, mobile overflow, scenario switching and identity mismatch. The paired micro fixture intentionally exposes `aux_bus`'s three voltage entries against four declared terminals as unavailable. Springfield and all 25 supplied ENWL cases pass import, all three layer switches, bounded rendering and geographic drilldown with no browser errors; these private files contain no paired results and therefore show unavailable operating values. Private data is not included in the repository.

### Conductor selection and voltage ranges

The voltage layer now offers exact terminal-name selection and minimum–maximum ranges in group labels and evidence. Colour continues to encode the maximum; a range is not presented as a violation or an imbalance measure. Selecting a name missing from a bus produces an explicit unavailable result. Terminal names do not imply phase continuity or neutral roles.

A user-selected reference terminal enables complex voltage subtraction, excluding that terminal from the all-terminal range. The evidence separately reports the reference terminal's magnitude, allowing neutral displacement to be inspected when the user selects a known neutral. Keyed results use the BMOPFTools ground reference; flat complex arrays require a declared common voltage reference and compatible terminal alignment. Magnitude-only results cannot supply terminal-to-terminal differences. Missing complex components retain partial coverage, and no neutral potential is assumed to be zero.

Validation adds exact-name selection, absent/ambiguous identities, reference exclusion, complex subtraction (including a nonzero neutral), missing components and array reference checks. All 15 build/model checks, five browser suites and 68 Julia assertions pass.
