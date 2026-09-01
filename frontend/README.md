# Browser prototype

This directory is the dependency-free walking skeleton described in the project roadmap. It can be served as static files while the production Svelte/Vite packages are still being designed.

From the repository root:

```sh
python3 -m http.server 8765 --directory frontend
```

Open <http://127.0.0.1:8765/> and drop `fixtures/micro/micro_bmopf.json` onto the page. The prototype supports:

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

The prototype intentionally has no external basemap or runtime backend. Its layout is deterministic and is not yet the final ELK-backed renderer.

Julia-generated reports display reproducibility metadata for the embedded case and renderer.
