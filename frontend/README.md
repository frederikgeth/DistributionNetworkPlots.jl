# Browser prototype

This directory is the dependency-free walking skeleton described in the project roadmap. It can be served as static files while the production Svelte/Vite packages are still being designed.

From the repository root:

```sh
python3 -m http.server 8765 --directory frontend
```

Open <http://127.0.0.1:8765/> and choose a built-in example, or drop a BMOPF
case such as `fixtures/micro/micro_bmopf.json` onto the page. The prototype supports the
features listed below. The Single-wire view is the default starting overview; the tabs
then proceed through Multi-wire, Geospatial, and Diagnostics.

For a single-directory distribution build, run `npm run build` from the
repository root. This writes `dist/` with a bundled `index.html`, stylesheet,
ordered explorer script, `build-manifest.json`, and the vendored ELK worker.
Serve that directory with `python3 -m http.server 8765 --directory dist`.
The generated site is runtime-dependency-free and can be copied to any static
host. The source-mode page above remains the preferred development loop, while
Julia reports continue to embed their own runtime independently.

Attach a BMOPFTools-style result JSON with the secondary file control after
opening a case. Raw result dictionaries and wrappers with an embedded
`case`/`network` are accepted. Run status/objective metadata appears in the
Results panel; recognised values for the selected asset appear in the
inspector, alongside a raw result-record view.

The same result files can be dropped onto the drop zone after a case is open.
The viewer keeps the open case, attaches the result, and warns when available
case IDs or fingerprints do not match; it still exposes whatever records can
be matched for best-effort inspection.

- Asset inventory and search.
- Source-property inspection and raw-record display.
- Inspector values use SI base units where BMOPF semantics are known (for example V, A, W, var, VA, Ω, Ω/m, S, m, Hz, and p.u.); engineering angles and geographic coordinates retain degrees. Unknown or model-dependent fields remain visibly unmodified and the raw record is always available.
- Endpoint links from devices to buses.
- Geospatial and schematic single-wire projections.
- Focused multi-wire terminal stacks and conductor pairing for selected buses, lines, switches, and transformers, including phase permutations, explicit neutral/ground cues, one switch blade per conductor, and one panel per multi-winding transformer port.
- One- and two-hop neighbourhood expansion from a selected bus.
- Back and Forward controls for stepping through selected assets and view changes; browser history and deep links remain supported.
- The single-line **Overview** control clears the focused asset and returns to the whole-network diagram; on oversized cases it re-enters the full-render confirmation.
- When Single-wire has a selected bus or asset with terminal data, a resizable Multi-wire component-detail pane appears alongside it. The pane can be collapsed, reopened, or promoted to the standalone Multi-wire view.
- Single-wire uses a collapsible floating HTML legend so symbol and result conventions stay readable while the SVG pans and zooms; exported SVG/PNG and print output retain an embedded legend.
- Pan, zoom, and fit/reset controls for the static SVG views.
- On desktop, drag the divider beside the details panel to change its width. The divider also supports Arrow keys, Home (default width), and End (widest width), and the preference is retained locally.
- Class overview and inventory columns have the same drag/keyboard resize affordance; widths are retained locally so result ranges and long asset names can stay readable.
- Single-wire buses and device symbols can be dragged to refine the diagram; bus/device positions are stored in the active case layout profile and moved symbols retain a dashed leader to their electrical anchor.
- Single-wire Display options can temporarily hide bus IDs, device IDs, and connection arrows, or show labels only for the selected asset; these decluttering choices apply for the current page session and do not change the case or saved layout.
- Selecting a line or DC branch in Multi-wire shows its Π-model data. Series entries are absolute `R+jX` values in Ω; linecode values in Ω/m are multiplied by the line length. Shunt `G/B` sections are shown in S only when nonzero, and pure-series branches explicitly omit them.
- Shared `renderer-contract-v1` boundary for SVG shells and canonical selectable asset references.
- Contract-backed `renderers/symbols.js` module for IEEE/IEC-inspired device symbols.
- Contract-backed `projections/multi-wire.js` and `layout/deterministic.js` modules keep terminal semantics and deterministic positioning independent from UI orchestration.
- Contract-backed `renderers/geospatial.js` and `renderers/single-wire.js` modules keep overview SVG composition independent from UI orchestration.
- Versioned layout profiles with deterministic fallback and bounded local retention (eight profiles per case).
- Distinct single-wire symbols for supported device classes and state styling.
- Reusable geospatial line geometry when supplied, with deterministic endpoint fallback.
- Focus selection frames the selected bus or device in geospatial and single-wire views.
- Geographic views omit buses without coordinates when a geographic frame is available and report the omission.
- Diagram assets expose keyboard focus, Enter/Space selection, and accessible names.
- The case summary and inspector expose support levels for rendered versus raw-only records.
- Multi-wire conductor rows show phase, neutral, and ground cues with colour, patterns, and labels.
- Terminal-map length mismatches are reported instead of silently padded in focused views.
- Clear load errors for invalid JSON, oversized files, and oversized JSON documents.
- Cases above the overview budget remain loadable. The viewer asks for confirmation before full geospatial or single-line rendering, with a page-session bypass checkbox and a focused-mode option.
- Schema-identifier diagnostics when a case omits or does not identify BMOPF.
- A Diagnostics view normalises result validation/profile findings and links each linked finding back to its asset.
- Built-in authored examples for the complete AC feeder and sparse/DC support-boundary cases; both include synthetic, provenance-labelled coordinates for immediate geospatial discovery, while the sparse case retains one deliberate omission.
- Diagnostics can be filtered by severity or text; the Results panel reports whether the sidecar identity is matched, mismatched, or unverified against the open case.

Multinetwork `nw` results are identified and require an explicit scenario
selection before asset metrics are shown; the active slice is displayed in the
Results panel.

Normalised `loading` values on lines (and supported transformer result records)
drive an overview colour/width cue. Explicit voltage-deviation fields on bus
result records drive bus outline colour, dash pattern, and a text cue; result
open/out-of-service states use dash and opacity. Legends explain these cues
without relying on colour alone. The thresholds are illustrative display bands,
not equipment protection limits.

The prototype intentionally has no external basemap or runtime backend. Its layout is deterministic by default. Dense single-line cases use a content-sized, scrollable canvas and preserve a minimum gap between buses in the same topology layer, rather than compressing every layer into the viewport. The Single-wire controls offer a deterministic force-directed arrangement as well as the optional vendored ELK Layered browser bundle (`elkjs@0.10.2`); both persist their resulting bus positions locally. Layout profiles are cached per case identity, direction, and root bus; selecting a root passes a fixed-root preference to ELK, while force-directed layout uses the graph topology and deterministic seeds. Manual bus nudges invalidate routed sections and return to deterministic paths. If the ELK bundle is unavailable, deterministic and force-directed layouts remain usable offline.

ELK runs on the main thread in every context. The vendored `elk.bundled.js`
only supports main-thread use: loaded inside a worker its internal shim fails
with `_Worker is not a constructor`, so source-mode, `dist/`, generated reports,
and `file://` pages all lay out on the main thread.

Generated Julia reports embed the pinned ELK bundle in the HTML so the optional
layout remains available without a network connection.

The browser smoke test is defined in `test/browser_smoke.mjs` and runs in CI
with Chromium; it asserts ELK layout, routed sections, cache signatures,
and profile restoration.

Julia-generated reports display reproducibility metadata for the embedded case and renderer.
The report metadata uses the versioned `sha256-json3-v1` fingerprint convention.
Results may provide the same `case_fingerprint` and algorithm in `meta`; when
both sides are present the Results panel reports a cryptographic match or
mismatch. Older results continue through the case-ID/name fallback.

Attach a second result with **Compare results** to inspect current and
comparison metrics for the same selected asset. Numeric scalar deltas are
reported as current minus comparison; arrays and non-numeric values remain
visible without an invented delta. The comparison case identity is checked
against the primary result/open case and shown as matched, mismatched, or
unverified.
