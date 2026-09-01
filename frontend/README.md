# Browser prototype

This directory is the dependency-free walking skeleton described in the project roadmap. It can be served as static files while the production Svelte/Vite packages are still being designed.

From the repository root:

```sh
python3 -m http.server 8765 --directory frontend
```

Open <http://127.0.0.1:8765/> and drop `fixtures/micro/micro_bmopf.json` onto the page. The prototype supports:

Attach a BMOPFTools-style result JSON with the secondary file control after
opening a case. Raw result dictionaries and wrappers with an embedded
`case`/`network` are accepted. Run status/objective metadata appears in the
Results panel; recognised values for the selected asset appear in the
inspector, alongside a raw result-record view.

- Asset inventory and search.
- Source-property inspection and raw-record display.
- Endpoint links from devices to buses.
- Geospatial and schematic single-wire projections.
- Focused multi-wire conductor pairing for a selected two-port device.
- One- and two-hop neighbourhood expansion from a selected bus.
- Pan, zoom, and fit/reset controls for the static SVG views.
- Distinct single-wire symbols for supported device classes and state styling.
- Reusable geospatial line geometry when supplied, with deterministic endpoint fallback.
- Focus selection frames the selected bus or device in geospatial and single-wire views.
- Geographic views omit buses without coordinates when a geographic frame is available and report the omission.
- Diagram assets expose keyboard focus, Enter/Space selection, and accessible names.
- The case summary and inspector expose support levels for rendered versus raw-only records.
- Multi-wire conductor rows show phase, neutral, and ground cues with colour, patterns, and labels.
- Terminal-map length mismatches are reported instead of silently padded in focused views.
- Clear load errors for invalid JSON, oversized files, and oversized JSON documents.
- Schema-identifier diagnostics when a case omits or does not identify BMOPF.
- A Diagnostics view normalises result validation/profile findings and links each linked finding back to its asset.
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

The prototype intentionally has no external basemap or runtime backend. Its layout is deterministic and is not yet the final ELK-backed renderer.

Julia-generated reports display reproducibility metadata for the embedded case and renderer.
