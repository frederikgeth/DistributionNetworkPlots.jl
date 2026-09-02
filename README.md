# DistributionNetworkPlots.jl

[![CI](https://github.com/frederikgeth/DistributionNetworkPlots.jl/actions/workflows/ci.yml/badge.svg)](https://github.com/frederikgeth/DistributionNetworkPlots.jl/actions/workflows/ci.yml)
[![CD](https://github.com/frederikgeth/DistributionNetworkPlots.jl/actions/workflows/pages.yml/badge.svg)](https://github.com/frederikgeth/DistributionNetworkPlots.jl/actions/workflows/pages.yml)
[![Documentation](https://img.shields.io/badge/docs-GitHub%20Pages-2ea44f)](https://frederikgeth.github.io/DistributionNetworkPlots.jl/)

Browser-native exploration of BMOPF distribution-network JSON cases, with Julia-generated static reports.

> **Rapidly evolving initiative:** this project is an early, actively changing
> release. APIs, visual semantics, supported BMOPF records, and result adapters
> may change without notice. Validate important engineering conclusions against
> the source case, BMOPFTools diagnostics, and your own domain review before
> relying on the viewer in production.

The repository contains a dependency-free static explorer. The GitHub Pages
deployment is built from `dist/` by GitHub Actions; local case files are still
read in the browser and are never uploaded by the application.

## Relationship to the BMOPF ecosystem

DistributionNetworkPlots.jl is the visual exploration companion to
[BMOPFTools.jl](https://github.com/frederikgeth/BMOPFTools.jl). BMOPFTools is
the Julia toolkit for parsing, validating, analysing, preparing, and profiling
BMOPF cases and result dictionaries; this project focuses on making those
cases and results inspectable in a browser through coordinated geospatial,
single-wire, and multi-wire views.

The case and result conventions follow the [IEEE Task Force mathematical and
data-model specifications](https://github.com/distribution-system-opt/math-and-data-model-specifications).
When the specification or BMOPFTools changes, this viewer may need an adapter
update. Please report compatibility findings with a small case/result example
and identify the relevant specification revision where possible.

## Try the browser prototype locally

From the repository root:

```sh
python3 -m http.server 8765 --directory frontend
```

Open <http://127.0.0.1:8765/> and drop [`fixtures/micro/micro_bmopf.json`](fixtures/micro/micro_bmopf.json) onto the page.

The browser also starts with two built-in authored examples. Both use clearly
labelled synthetic coordinates spread across a broad illustrative area so the
geospatial view is useful immediately; the sparse/DC case deliberately leaves
one bus unplaced to exercise missing-coordinate diagnostics. The complete AC
feeder covers the supported device classes.

To inspect solved values, use **Attach results JSON** and choose
[`fixtures/micro/micro_bmopf_result.json`](fixtures/micro/micro_bmopf_result.json)
after opening the case. Raw BMOPFTools-style result dictionaries are accepted;
the current adapter shows run metadata and recognised metrics for the selected
asset while preserving the complete result record for inspection.

Use **Compare results** to attach a second operating point. The inspector then
shows current, comparison, and numeric delta values for the selected asset;
[`fixtures/micro/micro_bmopf_result_comparison.json`](fixtures/micro/micro_bmopf_result_comparison.json)
provides an authored example.

The prototype supports:

- Asset-class inventory and search.
- Bus, device, and reusable-record inspection.
- Links between devices, buses, and linecodes.
- Geospatial schematic and single-wire projections.
- Single-line rendering with source-to-load layering, heavy busbars, orthogonal
  branch routing, labeled equipment, and IEEE/IEC-inspired symbols.
- Bus- and device-focused multi-wire drill-down with terminal stacks, phase permutations, open-switch interruptions, and explicit transformer winding ports.
- Local-only case loading with no runtime backend.
- Browser-side guardrails for invalid JSON and oversized case files.
- Optional BMOPFTools-style result JSON sidecars with objective/status summary and asset-level metrics.
- Result JSON sidecars can be dropped onto an open case; pairing mismatches are surfaced as warnings while metrics remain available for best-effort inspection.
- Diagnostics view for filterable result validation/profile findings, clickable linked assets, and explicit case/result pairing status.
- Result-aware overview cues for loading, explicit bus voltage deviation, and open/out-of-service state, with non-colour legend guidance.
- Built-in example cases that can be loaded directly from the frontend for repeatable demonstrations and semantic smoke tests.
- Side-by-side comparison of two result sidecars while retaining stable source-asset identity.
- Ranked inventory search across asset IDs, bus links, and result field names, with keyboard jump-to-match.
- Back/Forward navigation through selected assets and view changes, including multi-wire drill-down paths.
- Resizable desktop details panel with keyboard-accessible divider and a remembered width preference.
- Resizable class-overview and inventory columns, with keyboard-accessible separators and remembered widths for long result ranges and asset names.
- Draggable single-wire buses and device symbols with locally persisted layout overrides and dashed leaders for moved symbols.
- Branch-focused multi-wire Π-model views with series R+jX values in Ω and conditional shunt G/B sections in S.
- An explicit **Overview** control in the single-line view clears the focused selection; oversized cases re-show the full-render confirmation before expanding.
- Built-in accessible help panel explaining view semantics, symbols, conductor cues, and result encodings.
- Export of the active geospatial or single-line SVG for reports and issue attachments.
- Export of the active view as a 2× PNG, plus a print stylesheet for clean diagram output.
- Locally persisted single-line bus adjustments with per-bus nudge, lock/unlock, and reset controls.
- Configurable single-line direction and feeder-root selection, also persisted per case.
- Optional worker-backed, vendored ELK Layered layout enhancement with fixed-root preference and orthogonal edge routing; deterministic offline fallback remains available and generated reports embed the pinned bundle.
- Class overview with asset counts, support-level breakdowns, and result ranges; class links filter the explorer.
- Explicit overview SVG budgets with a focused one-hop fallback for oversized cases.
- Large cases can be opened after a browser confirmation; the warning can be bypassed for the current page, or the focused neighbourhood view can be retained.

## Build a distributable static site

The source-mode prototype is convenient for development. To assemble a
publishable, dependency-free site, run:

```sh
npm install
npm run build
python3 -m http.server 8765 --directory dist
```

The generated `dist/` directory contains an `index.html`, one ordered browser
bundle, the stylesheet, the pinned offline ELK worker bundle, and a
`build-manifest.json` describing the bundle contents. The output is ignored by
Git because it is reproducible; copy or publish `dist/` as a complete
directory. The site has no runtime Node.js requirement.

Julia-generated reports remain a separate self-contained distribution format:
`render_case` embeds the source modules and vendor assets directly in one HTML
file, so the static assembler is not required for reports.

## Publish with GitHub Pages

The [`Deploy GitHub Pages`](.github/workflows/pages.yml) workflow runs on pushes
to `main` and can also be started manually from the Actions tab. It verifies the
static bundle, builds `dist/`, uploads it as a Pages artifact, and publishes it
to the repository's `github-pages` environment. After enabling the workflow,
set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**;
the workflow will expose the published URL on each successful run.

## Generate a static Julia report

```julia
using DistributionNetworkPlots
render_case("fixtures/micro/micro_bmopf.json", "micro-report.html")
```

The generated report embeds the case and frontend runtime. It does not require Node.js or an application server.
Generated reports also expose a case fingerprint, schema identifier, application version, and layout-engine identifier for reproducibility.
When a result includes the optional matching `case_fingerprint` and
`case_fingerprint_algorithm` metadata, the report verifies that pairing
cryptographically; otherwise it retains the identity-based fallback and marks
the result unverified when necessary.

## Licensing and case provenance

The library source code is released under the [BSD 3-Clause License](LICENSE). Original BMOPF case files authored in this repository, including the micro fixture, are released under [CC BY 4.0](LICENSE-DATA). Their `meta.license`, `meta.attribution`, and `meta.source` fields are part of the case provenance.

Cases reused from another initiative are not relicensed by this project. Keep each reused case in an isolated fixture directory with its exact source license, attribution, citation or URL, and a provenance note as described in [`fixtures/README.md`](fixtures/README.md).

## Test

```sh
julia --project=. -e 'using Pkg; Pkg.test()'
```

Optional browser end-to-end smoke test (requires Node.js and Playwright):

```bash
npm install
npx playwright install chromium
npm run test:browser
```

The static assembler has a fast smoke test that checks bundle ordering,
asset references, and the offline vendor path:

```bash
npm run test:build
```

GitHub Actions runs both the Julia suite and this browser smoke test on pushes
and pull requests.

## Project references

- [Architecture](ARCHITECTURE.md)
- [Roadmap](ROADMAP.md)
- [Frontend prototype notes](frontend/README.md)

The architecture and roadmap describe the intended production boundaries, supported behaviours, and staged path from this prototype to a stable viewer.
