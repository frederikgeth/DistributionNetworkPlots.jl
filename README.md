# DistributionNetworkPlots.jl

Browser-native exploration of BMOPF distribution-network JSON cases, with Julia-generated static reports.

The repository currently contains a dependency-free walking skeleton. It is private while the data model and visual semantics are being validated; deployment and GitHub Pages setup are intentionally deferred.

## Try the browser prototype locally

From the repository root:

```sh
python3 -m http.server 8765 --directory frontend
```

Open <http://127.0.0.1:8765/> and drop [`fixtures/micro/micro_bmopf.json`](fixtures/micro/micro_bmopf.json) onto the page.

To inspect solved values, use **Attach results JSON** and choose
[`fixtures/micro/micro_bmopf_result.json`](fixtures/micro/micro_bmopf_result.json)
after opening the case. Raw BMOPFTools-style result dictionaries are accepted;
the current adapter shows run metadata and recognised metrics for the selected
asset while preserving the complete result record for inspection.

The prototype supports:

- Asset-class inventory and search.
- Bus, device, and reusable-record inspection.
- Links between devices, buses, and linecodes.
- Geospatial schematic and single-wire projections.
- Bus- and device-focused multi-wire drill-down.
- Local-only case loading with no runtime backend.
- Browser-side guardrails for invalid JSON and oversized case files.
- Optional BMOPFTools-style result JSON sidecars with objective/status summary and asset-level metrics.
- Diagnostics view for filterable result validation/profile findings, clickable linked assets, and explicit case/result pairing status.
- Result-aware overview cues for loading, explicit bus voltage deviation, and open/out-of-service state, with non-colour legend guidance.

## Generate a static Julia report

```julia
using DistributionNetworkPlots
render_case("fixtures/micro/micro_bmopf.json", "micro-report.html")
```

The generated report embeds the case and frontend runtime. It does not require Node.js or an application server.
Generated reports also expose a case fingerprint, schema identifier, application version, and layout-engine identifier for reproducibility.

## Licensing and case provenance

The library source code is released under the [BSD 3-Clause License](LICENSE). Original BMOPF case files authored in this repository, including the micro fixture, are released under [CC BY 4.0](LICENSE-DATA). Their `meta.license`, `meta.attribution`, and `meta.source` fields are part of the case provenance.

Cases reused from another initiative are not relicensed by this project. Keep each reused case in an isolated fixture directory with its exact source license, attribution, citation or URL, and a provenance note as described in [`fixtures/README.md`](fixtures/README.md).

## Test

```sh
julia --project=. -e 'using Pkg; Pkg.test()'
```

## Project references

- [Architecture](ARCHITECTURE.md)
- [Roadmap](ROADMAP.md)
- [Frontend prototype notes](frontend/README.md)

The architecture and roadmap describe the intended production boundaries, supported behaviours, and staged path from this prototype to a stable viewer.
