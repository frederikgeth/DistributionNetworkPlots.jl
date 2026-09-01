# DistributionNetworkPlots.jl

Browser-native exploration of BMOPF distribution-network JSON cases, with Julia-generated static reports.

The repository currently contains a dependency-free walking skeleton. It is private while the data model and visual semantics are being validated; deployment and GitHub Pages setup are intentionally deferred.

## Try the browser prototype locally

From the repository root:

```sh
python3 -m http.server 8765 --directory frontend
```

Open <http://127.0.0.1:8765/> and drop [`fixtures/micro/micro_bmopf.json`](fixtures/micro/micro_bmopf.json) onto the page.

The prototype supports:

- Asset-class inventory and search.
- Bus, device, and reusable-record inspection.
- Links between devices, buses, and linecodes.
- Geospatial schematic and single-wire projections.
- Bus- and device-focused multi-wire drill-down.
- Local-only case loading with no runtime backend.

## Generate a static Julia report

```julia
using DistributionNetworkPlots
render_case("fixtures/micro/micro_bmopf.json", "micro-report.html")
```

The generated report embeds the case and frontend runtime. It does not require Node.js or an application server.

## Test

```sh
julia --project=. -e 'using Pkg; Pkg.test()'
```

## Project references

- [Architecture](ARCHITECTURE.md)
- [Roadmap](ROADMAP.md)
- [Frontend prototype notes](frontend/README.md)

The architecture and roadmap describe the intended production boundaries, supported behaviours, and staged path from this prototype to a stable viewer.
