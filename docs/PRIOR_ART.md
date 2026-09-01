# Prior art and results-aware visualisation direction

This note records the design evidence behind the next roadmap slices. It is
intentionally short and links to the upstream projects so that implementation
choices can be revisited as those projects evolve.

## PowerPlots.jl: interactions to copy

[PowerPlots.jl](https://github.com/WISPO-POP/PowerPlots.jl) is the closest
overlapping initiative. Its [basic examples](https://wispo-pop.github.io/PowerPlots.jl/dev/examples/basic%20examples/)
show a useful set of affordances:

- configurable colour and size mappings, so a plot can encode a domain metric;
- filtered hover fields, so tooltips stay useful instead of dumping a record;
- a multinetwork slider for time/scenario data;
- distribution-grid support through PowerModelsDistribution data; and
- export to SVG, PNG, PDF, and HTML.

Its [layout documentation](https://wispo-pop.github.io/PowerPlots.jl/dev/data_transformations/layouts/)
also makes two practices worth adopting: fixed coordinates should be accepted
as a first-class input, and computed coordinates should be stored with the
transformed data so a view can be reproduced. The documentation notes that
general-purpose force layouts become expensive as networks grow, which supports
keeping this project’s focused multi-wire view and deferring large-case layout
work until it is measured.

The [PowerPlots paper](https://arxiv.org/abs/2510.05063) reinforces the same
interaction model: graph/data-frame transforms, layered marks, custom fields,
hover/label controls, and sliders for multinetwork, time, or scenario data.

### What we should adopt

1. A small, explicit metric adapter that maps result fields to tooltip rows and
   optional visual encodings.
2. A scenario/time control that changes the active result slice without
   rebuilding the case index.
3. Reproducible layout coordinates and exportable static views.
4. Class-aware overview summaries (counts, ranges, and warnings) before adding
   more decorative symbols.

### What we should not copy blindly

- VegaLite should not become the canonical renderer: focused multi-wire views
  need explicit terminals, phase permutations, neutral/ground cues, and source
  links that are easier to keep electrically honest in a purpose-built SVG
  projection.
- Kamada-Kawai or another force layout should not be the default for larger
  distribution feeders. Use deterministic/fixed coordinates where available,
  layered layout for single-wire diagrams, and reserve force layout for an
  explicitly selected exploratory mode.
- A browser view must not silently fetch basemaps or discard unsupported source
  fields. Tile-free static output and raw-record inspection remain defaults.

## BMOPFTools ecosystem: the source of truth for results

[BMOPFTools.jl](https://github.com/frederikgeth/BMOPFTools.jl) supplies the BMOPF
case model and result/report workflow. Its result dictionaries are solver
outputs rather than a second visual model: they can contain objective and
termination information alongside component-level values, and
`profile_solution` derives bound violations, near-active bounds, residuals, and
solution-quality information.

[BMOPFDraftData](https://github.com/frederikgeth/BMOPFDraftData) demonstrates the
expected corpus shape: cases, solved result JSON files, provenance, and
machine-readable tags for model tier, benchmark class, challenge, and solution
profiles. This makes result visualisation more than a voltage overlay: it is an
opportunity to expose run quality, binding constraints, and comparisons across
snapshots while retaining exact case/result provenance.

[PowerIO.jl](https://github.com/eigenergy/powerio) is the relevant parser/model
boundary. Its distribution package supports BMOPF JSON and preserves source or
unsupported sections. The browser should therefore consume a stable indexed
case plus an adapter for result sidecars, rather than reimplement every import
format in the renderer.

## Other initiatives and their relevance

- [PowerModelsDistribution](https://arxiv.org/abs/2004.10081) is the engineering
  and mathematical reference for unbalanced distribution OPF semantics; use it
  to validate what a visual connection or result metric means.
- [PowerDynamics.jl](https://github.com/JuliaEnergy/PowerDynamics.jl) is useful
  prior art for time-series and observable-driven result views, even though its
  dynamic simulations are outside the first BMOPF viewer release.
- [JuliaPowerCase](https://github.com/Matrixeigs/JuliaPowerCase) and
  [PowSyBl](https://lfenergy.org/projects/powsybl/) show broader typed-model,
  topology-analysis, and enterprise integration patterns. They are integration
  candidates, not dependencies for the static browser prototype.

## Design consequences

The browser will treat a result as an attachable, immutable sidecar:

```text
case JSON -> canonical index -> views and inspector
result JSON -> result adapter -> selected metrics, run summary, overlays
```

The adapter must tolerate a raw BMOPFTools result dictionary and an optional
wrapper containing `case`/`network` plus `result`. It must preserve unknown
fields, identify the active case when a fingerprint is available, and make
multinetwork results visible as a pending scenario-selection state rather than
silently choosing a slice.

Every reused case or result fixture keeps its source licence and attribution.
Only authored examples in this repository use the repository’s CC BY 4.0 data
licence.

## STAC (Monash/DATA61): usability patterns to carry forward

[STAC](https://immersive.erc.monash.edu/stac/) is an earlier browser-first
steady-state AC network explorer. Its [source repository](https://github.com/aayushGaur/stac)
is MIT-licensed and describes a client-side workflow built around D3 and
WebCola. The live demo explicitly recommends a practical scale envelope (under
500 buses) and keeps dropped cases in local memory.

### Strong patterns to adopt

- **Validation as a view, not only a log.** STAC computes warnings/errors and
  highlights the affected node, edge, or decorator in one action. For BMOPF,
  this should become a result/diagnostic mode driven by `profile_solution`:
  bound violations, residuals, and near-active constraints should be clickable
  and should focus the corresponding asset.
- **Layout ownership.** STAC supports automatic layout, exporting a layout,
  and locking/unlocking bus positions. We should persist a versioned layout
  sidecar keyed by case fingerprint and layout options, with per-bus locks and
  an explicit reset-to-computed action.
- **Search-to-focus.** Its bus autocomplete immediately zooms to the selected
  element. Our search already selects assets; the next refinement is ranked
  suggestions across buses/devices/results plus a focus action that preserves
  the current view.
- **Visible scale guidance.** The under-500-bus recommendation is useful
  product honesty. We should publish measured budgets for SVG element count,
  load time, and interaction latency, then offer a focused-neighbourhood mode
  when a case exceeds them.
- **Decorators and help.** STAC’s element decorators and help graph make
  symbols discoverable. We should provide a compact, accessible legend/help
  panel for BMOPF asset symbols, conductor cues, and result encodings.

### Patterns to adapt or deliberately defer

- STAC’s parser is tied to MATPOWER text and a rules file. We should keep the
  canonical BMOPF index/parser boundary and use metadata-driven metric adapters
  instead of reproducing that parser architecture.
- Its solution updater computes one steady-state flow and the solution view is
  explicitly unfinished. For this project, result sidecars must support
  multiple operating points and `nw` slices first; a dedicated flow projection
  comes only after the metric and scenario contracts are stable.
- STAC’s validation colours are useful, but colour alone is not sufficient for
  four-wire distribution semantics. Every warning/error overlay needs labels,
  patterns, inspector details, and an accessible list/search surface.
- The repository’s MIT licence is compatible with this project’s BSD-3-Clause
  code licence, but no STAC source or image assets are copied. Any future reuse
  must preserve the MIT notice and be recorded in the source inventory.
