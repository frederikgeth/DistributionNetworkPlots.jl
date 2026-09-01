# DistributionNetworkPlots.jl Roadmap

Status: proposed delivery plan  
Last updated: 2026-09-01

## 1. Roadmap objective

Deliver a testable, static browser explorer for BMOPF JSON cases without waiting for all three visualisations to be complete or polished.

The first useful release must prove the riskiest architectural claim: one source asset can be selected, inspected, followed to related assets, and shown consistently in geospatial, single-wire, and multi-wire projections.

The durable system boundaries and domain invariants are defined in [ARCHITECTURE.md](ARCHITECTURE.md). This roadmap may change delivery order without weakening those invariants unless an explicit architectural decision supersedes them.

## Current implementation status

- [x] Repository, Julia package, static browser shell, and CI-ready test entry points scaffolded.
- [x] CC BY 4.0 micro-fixture covering buses, terminal maps, line, switch, two- and multi-winding transformers, source, load, generator, IBR, shunt, capacitor, and a reusable linecode.
- [x] Canonical browser index with stable JSON-pointer identities, ports, connections, reverse bus indexes, class counts, and diagnostics.
- [x] Walking-skeleton geospatial, single-wire, and focused multi-wire views with shared selection and inspector navigation.
- [x] Bus-focused multi-wire drill-down and reusable-record links in the inspector.
- [x] Multi-winding transformer ports remain explicit in the canonical index and focused multi-wire view.
- [x] One- and two-hop neighbourhood control for bus-focused multi-wire drill-down.
- [x] Static-view pan, zoom, and fit/reset controls across all projections.
- [x] Distinct single-wire symbols and visible open/out-of-service styling for supported asset classes.
- [x] Geospatial routes from reusable line geometry with straight-line fallback.
- [x] Focus-selection action frames the selected bus or device in overview views.
- [x] Partial geographic coverage is explicit; buses without coordinates are not placed on the geographic canvas.
- [x] Julia-generated self-contained report with safe JSON embedding.
- [x] Static report metadata with case fingerprint, schema, application version, and layout-engine identifier.
- [x] Keyboard-selectable diagram assets with ARIA names, selected-view state, and reduced-motion handling.
- [x] Explicit support-level badges for fully rendered, focused, and raw-inspector-only records.
- [x] Multi-wire phase, neutral, and ground cues use both line patterns and visible labels.
- [x] Terminal-map length mismatches are surfaced as case and focused-view diagnostics.
- [x] Results JSON can be attached as a sidecar and selected asset metrics are visible in the inspector.
- [x] Normalised line-loading results are visible in overview stroke colour/width, legend, and tooltips.
- [x] Diagnostics view normalises result validation/profile findings and links linked findings back to assets.
- [x] Diagnostics findings can be filtered by severity and text while preserving the total finding count.
- [x] Result attachment reports matched, mismatched, or unverified case identity status.
- [ ] Replace prototype layout with worker-backed ELK layout and production renderer packages.
- [ ] Add automated browser end-to-end tests to CI once the JavaScript toolchain is available.

Time boxes below are indicative for one primary developer. Scope is fixed within a slice; time is not a promise.

## 2. Delivery principles

- Ship vertical slices that a domain user can exercise in a browser.
- Keep `main` releasable once the walking skeleton lands.
- Exercise multi-wire semantics before polishing the easier views.
- Use real BMOPF records early, but isolate licensing-sensitive fixtures.
- Prefer observable diagnostics over silent fallback behaviour.
- Measure before adding WebGL, virtualisation, or complex caching.
- Separate release criteria from optional polish.
- Record architectural changes in ADRs when they change a boundary in `ARCHITECTURE.md`.

## 3. Release sequence

| Release | Target outcome | Indicative elapsed time |
|---|---|---:|
| 0.0.1 Walking skeleton | Load, inspect, navigate, and show one asset in all three views | 5 working days |
| 0.1.0 Usable alpha | Small BMOPF cases are genuinely explorable and exportable | 10–15 working days |
| 0.2.0 Diagram beta | Single-wire and focused multi-wire semantics cover the agreed MVP | 3–4 weeks |
| 0.3.0 Scale and accessibility beta | Larger cases, keyboard use, and responsive behaviour meet budgets | 5–6 weeks |
| 1.0.0 Stable viewer | Versioned API, documented support matrix, fixtures, and release process | Determined from beta evidence |

## 4. Milestone 0: project and fixture foundation

Indicative time box: 1–2 days.

### Outcome

A reproducible development environment and a tiny semantic fixture that lets every subsequent slice be tested without depending on a large external dataset.

### Deliverables

- Julia package skeleton with a minimal load test.
- `frontend/` TypeScript/Svelte/Vite workspace.
- Static development application with automated build and test commands.
- Hand-authored `fixtures/micro/` BMOPF case with explicit licensing.
- Fixture design note mapping each record to the semantic behaviour it exercises.
- Basic CI for Julia tests, frontend type checking, unit tests, and static build.
- One command for a developer to run the local preview.

### Micro fixture content

- Buses with phase, neutral, and grounded terminals.
- A normal line and an open switch.
- A conductor permutation or missing phase.
- A two-winding transformer.
- A representative multi-winding transformer, if the current schema supports an unambiguous form.
- Source, load, generator, IBR, shunt, and capacitor records.
- Geographic coordinates on some or all buses with explicit provenance.
- One unknown field to verify source preservation.
- One intentional warning that does not prevent viewing.

### Acceptance criteria

- A clean checkout can run all initial checks using documented commands.
- The fixture passes the intended BMOPF schema validation except for deliberately documented warning cases.
- Fixture identities are stable and expected source JSON Pointers are tested.
- No non-permissively licensed case data is copied into the repository accidentally.

### Exit gate

Do not begin visual polish until the fixture covers the port and terminal semantics required by the first multi-wire slice.

## 5. Milestone 1: ingestion, index, and inspector

Indicative time box: 1–2 days.

### Outcome

A user can open a BMOPF JSON file, understand what it contains, search its assets, and inspect source properties before any sophisticated diagram exists.

### Deliverables

- File picker and drag/drop.
- JSON parsing with file-size and element-count limits.
- Schema-version detection and validation summary.
- Canonical buses, devices, ports, stable asset references, and reverse indexes.
- Asset-class inventory and searchable asset list.
- Persistent inspector with summary fields, related-object links, and raw-record view.
- Empty, invalid, partially supported, and loading states.

### Acceptance criteria

- Opening the micro fixture shows the correct counts for every included asset class.
- Every device port resolves to an existing bus or produces a targeted diagnostic.
- Selecting a line exposes working links to both endpoint buses.
- Selecting a bus lists its incident devices.
- Unknown source fields appear in the safely escaped raw-record view.
- Invalid JSON and unsupported schema versions produce actionable messages without crashing the application.
- No case content leaves the browser.

### User review prompt

Ask a BMOPF domain user to find a named line, inspect its terminal maps, jump to both buses, and identify all other assets attached to one bus. Record friction before adding diagrams.

## 6. Milestone 2: three-view walking skeleton

Indicative time box: 2 days.

### Outcome

All three views exist and share selection, even though their layout and symbols are deliberately minimal.

### Deliverables

- View switcher for geospatial, single-wire, and multi-wire.
- Shared `selected`, `hovered`, and `focusRequest` state.
- Hash-based deep link for the active view and selected asset.
- Minimal geospatial renderer with bus points and straight endpoint connections.
- Minimal single-wire renderer with manually simple or deterministic test layout.
- Minimal focused multi-wire renderer for a selected bus/asset neighbourhood.
- Consistent selected and hover styling.

### Acceptance criteria

- Select a line in any view, switch views twice, and retain the same `AssetRef`.
- Follow an inspector link from a line to a bus and frame that bus in the active view.
- Reloading a deep link restores the supported view and selection.
- The multi-wire view shows conductor pairing from source terminal maps for the micro line and switch.
- Missing geographic coordinates produce an explicit unavailable/partial state, not invented map placement.
- Every rendered feature resolves back to exactly one source record.

### Release

Tag `v0.0.1` and publish a static preview. This is the earliest meaningful stakeholder demo.

## 7. Milestone 3: usable geospatial and single-wire views

Indicative time box: 3–4 days.

### Outcome

Small realistic cases are legible and explorable in the two overview views.

### Deliverables

- MapLibre integration with a tile-free default canvas.
- Optional online basemap configuration and attribution.
- Coordinate-space and coordinate-coverage diagnostics.
- Device routes when supplied; straight endpoint paths otherwise.
- ELK layered layout in a Web Worker.
- Single-wire symbols for bus, line, switch, transformer, source, load, generator, IBR, shunt, and capacitor.
- Open/out-of-service styling.
- Pan, zoom, fit-all, and focus-selection behaviour.
- Lightweight tooltips and persistent inspector coordination.
- Layout caching keyed by case fingerprint and layout options.

### Acceptance criteria

- The micro fixture renders without topology loss in both views.
- A redistribution-compatible small real case is legible at first fit.
- Multi-winding transformer connections are not reduced to a false pairwise topology.
- Open switches remain visible and visually distinct.
- Online basemap mode discloses external network access and shows required attribution.
- Tile-free mode performs no basemap requests.
- Layout work does not freeze basic UI interaction for the agreed small-case fixture.

## 8. Milestone 4: faithful focused multi-wire view

Indicative time box: 3–5 days.

### Outcome

Users can drill into the terminal-level structure around a selected asset or bus and trust what they see.

### Deliverables

- One- and two-hop neighbourhood control.
- Bus terminal stack or busbar representation.
- Phase, neutral, and ground styling using colour plus non-colour cues.
- Explicit conductor pairing and phase permutations.
- Open-switch conductor representation.
- Two-winding transformer port/winding symbol.
- Agreed representation for supported multi-winding transformer forms.
- Attachment badges or symbols tied to specific terminals.
- Clear diagnostic presentation for semantics not yet renderable.
- Transition from collapsed bundle to expanded conductor detail.

### Acceptance criteria

- Every conductor in the micro fixture joins the expected source and target terminals.
- Neutral and ground remain distinct concepts.
- A phase permutation is visually and structurally correct.
- A selected transformer exposes every supported winding port and connected bus.
- The inspector and diagram agree on terminal order and device status.
- Unsupported connections are marked as unsupported rather than approximated.
- Users can move from an overview line to its multi-wire neighbourhood in one action.

## 9. Milestone 5: Julia static report export

Indicative time box: 2–3 days.

### Outcome

A Julia user can turn a BMOPF case into a portable interactive report without installing frontend tooling.

### Deliverables

- Initial public Julia export function.
- Precompiled frontend assets included in the Julia package artifact.
- Safe embedded JSON transport.
- Standalone single-HTML output for appropriately sized cases.
- Directory output for large cases or separate cached assets.
- Report metadata containing case fingerprint, schema identifier, application version, and layout engine version.
- A Julia example and generated-report smoke test.

### Acceptance criteria

- A Julia test generates a report from the micro fixture.
- The report opens in a browser and supports selection, related-object navigation, and all three views.
- Embedded strings containing `</script>`, markup, Unicode, and unusual IDs cannot break or inject into the report.
- A Julia end user does not need Node.js to generate a report from a released package.
- Tile-free output functions without an application backend or external basemap request.

### Release

Tag `v0.1.0` once Milestones 0–5 pass their exit criteria and user review findings have been triaged.

## 10. Milestone 6: diagram breadth and domain beta

Indicative time box: 1 week after alpha feedback.

### Outcome

The diagram support matrix expands based on actual user findings, and the project has evidence that its visual conventions work beyond the micro fixture.

### Deliverables

- Triage and resolution of correctness or navigation findings from the alpha review.
- Broader transformer-form coverage chosen from real cases.
- Explicit supported/partial/raw-only asset support matrix.
- Improved voltage-level grouping, feeder-root selection, and layout controls where user testing demonstrates value.
- Semantic zoom or collapsed bundle behaviour sufficient for the selected beta fixtures.
- A second real-case review from a different network family.

### Acceptance criteria

- No known supported device is drawn with electrically false connectivity.
- Every asset marked "fully supported" has source-to-projection tests in both diagram views.
- Partially supported devices remain selectable and inspectable, with visible limitations.
- Two domain users can complete the critical workflow on different case families.
- Alpha feedback is closed, scheduled, or documented as an accepted limitation.

### Release

Tag `v0.2.0` and publish the asset support matrix with the release.

## 11. Milestone 7: scale, accessibility, and responsive behaviour

Indicative time box: 1–2 weeks after the alpha.

### Outcome

The explorer remains usable on larger feeders, keyboards, and smaller screens.

### Deliverables

- Baseline timing and memory measurements for micro, small-real, and large fixtures.
- Performance budgets derived from measurements and user expectations.
- Search/list virtualisation only if measured as necessary.
- Map clustering, deck.gl, Canvas, or SVG level-of-detail only where a budget is exceeded.
- Keyboard traversal and selection for diagram assets.
- Accessible names, roles, focus visibility, and inspector focus management.
- Responsive inspector as side panel or bottom sheet.
- Reduced-motion handling.
- Colour-vision and contrast review.

### Acceptance criteria

- All critical workflows are possible without a pointing device.
- Selection and related-object navigation remain understandable with colour removed.
- The browser stays responsive for the selected large fixture under the documented test environment.
- Multi-wire focus mode bounds work independently of total network size.
- Automated accessibility checks pass, followed by a short manual keyboard review.

### Release

Tag `v0.3.0` after publishing the measured performance envelope and known limits.

## 12. Milestone 8: stable viewer

### Outcome

The supported format and public Julia API are stable enough for downstream use.

### Deliverables

- Published BMOPF schema support matrix.
- Documented coordinate conventions and fallbacks.
- Public Julia API documentation.
- Versioning and deprecation policy.
- Third-party licence and map-attribution inventory.
- Contribution guide and fixture licensing rules.
- Release notes generated from user-visible changes.
- At least one downstream or external-user integration trial.

### 1.0 release gate

- No unresolved correctness defects that can present electrically false connectivity.
- Every supported asset class has source-to-visual and visual-to-source tests.
- Static report output is reproducible and versioned.
- Known scale limits are measured and documented.
- The support matrix distinguishes full, partial, and raw-inspector-only asset support.
- A domain user can complete the critical workflow without developer assistance.

## 13. Critical user workflow

This workflow is the acceptance backbone for every release:

1. Open or drop a BMOPF JSON case.
2. Understand validation state and asset inventory.
3. Search for a line, transformer, IBR, or bus.
4. Select it in one view.
5. Inspect its important and raw properties.
6. Follow a relationship to a connected bus or device.
7. Switch to another view without losing selection.
8. Open the terminal-level neighbourhood in multi-wire view.
9. Share or regenerate a static report that reproduces the exploration state where supported.

Features that do not strengthen this workflow should not delay the alpha.

## 14. Definition of done for every slice

A slice is done only when:

- User-visible behaviour has acceptance criteria and automated coverage at the appropriate layer.
- Invalid, missing, and partially supported data have designed states.
- Keyboard and focus behaviour have been considered.
- Source identity and raw-record access are preserved.
- No new external network access occurs without disclosure.
- Fixture licensing is recorded.
- Documentation describes the behaviour and known limits.
- The static application builds successfully in CI.
- A reviewer can exercise the slice through a deployed or locally generated artifact.

## 15. Initial backlog

### Now: required for 0.1.0

- Repository and CI scaffold.
- Micro semantic fixture.
- Ingestion strategy spike and ADR.
- Canonical port model and reverse indexes.
- Validation and diagnostics UI.
- Asset inventory, search, inspector, and relationship links.
- Shared selection and hash navigation.
- Walking skeleton of all three views.
- MapLibre geospatial view with tile-free mode.
- ELK single-wire layout.
- Focused multi-wire view.
- Julia static report generation.
- End-to-end critical workflow test.

### Next: candidates for 0.2–0.3

- Broader transformer support.
- Layout direction and feeder-root options.
- Semantic zoom and collapsed conductor bundles.
- Asset property aggregates and richer class overviews.
- Search result highlighting and keyboard shortcuts.
- Large-case profiling and targeted renderer upgrades.
- Export current view as SVG or PNG.
- Theme and print stylesheet.

### Results-aware visualisation: next vertical slices

- [x] Attach a raw BMOPFTools-compatible result JSON sidecar to an indexed case, show objective/termination metadata, and expose selected asset metrics with safe raw-record access.
- [ ] Compute and compare canonical cryptographic case fingerprints for robust case/result pairing (current status is identity-based and may be unverified).
- [x] Add a multinetwork/time/scenario selector; never silently choose the first `nw` slice.
- [ ] Add result-driven visual encodings for voltage deviation, line/transformer loading, and open/out-of-service state, with legends and accessible non-colour cues.
- [x] Surface BMOPFTools solution-profile findings (bound violations, near-active bounds, and residuals) as filterable diagnostics.
- [ ] Compare two operating points or result sidecars while keeping source asset identity stable.
- [x] Add a validation/diagnostic view that focuses assets with BMOPFTools solution-profile violations, residuals, and near-active bounds.
- [ ] Persist versioned layouts keyed by case fingerprint, including per-bus lock/unlock and reset-to-computed controls.
- [ ] Add ranked search suggestions across buses, devices, diagnostics, and result metrics.
- [ ] Publish measured SVG/interaction budgets and an explicit focused-neighbourhood fallback for cases above them.
- [ ] Add an accessible help/legend panel for symbols, conductor cues, and result encodings.

### Later: explicitly outside the alpha

- Case editing and round-trip write-back.
- Full result-derived styling before the metric adapter and scenario semantics are stable.
- Time-series animation (a selector and static snapshot export come first).
- Comparison of two cases or operating points.
- Saved annotations.
- Offline basemap packages.
- General OpenDSS or PMD ingestion unless supplied through a shared parser boundary.
- Full-network expanded multi-wire rendering without a demonstrated user need.

## 16. Risk register

| Risk | Impact | Early evidence or mitigation | Decision point |
|---|---|---|---|
| Canonical model cannot represent transformer variants | Electrically incorrect diagrams | Put representative transformers in the micro fixture; create an ingestion ADR | Before walking skeleton exit |
| Coordinate semantics are ambiguous | Misleading geospatial placement | Require coordinate provenance and show partial/unavailable state | Before MapLibre integration |
| Browser parser duplicates BMOPF semantics | Drift from BMOPFTools/PowerIO | Compare with Tellegen/PowerIO ingestion; evaluate parser-only reuse | Milestone 0 spike |
| SVG becomes slow on large cases | Poor interaction | Measure separately; keep focused multi-wire; add LOD only after profiling | Milestone 7 |
| Full multi-wire view becomes unreadable | Low product value despite effort | Treat focused neighbourhood as primary drill-down | User review after Milestone 4 |
| Static single-file reports become very large | Slow open/share | Support directory output and thresholds | Milestone 5 |
| Basemap creates privacy/licensing surprises | Trust and compliance issues | Tile-free default, explicit online mode, attribution inventory | Milestone 3 |
| Fixtures cannot be redistributed | Broken CI/demo or licensing exposure | Hand-author micro fixture; verify small-real licence | Milestone 0 |
| Diagram polish delays semantic validation | Weeks without feedback | Release crude all-view walking skeleton first | Milestone 2 |
| Schema evolves during development | Rework and silent incompatibility | Version adapters, source preservation, pinned fixtures | Continuous |

## 17. Decision spikes

Each spike is time-boxed to one day and ends with a short ADR or explicit deferral.

### Spike A: ingestion boundary

Compare:

1. Direct TypeScript JSON indexing plus JSON Schema validation.
2. Tellegen `ingestDistCase` as an initial browser adapter.
3. A parser-only PowerIO WASM boundary, if one can be exposed cleanly.

Evaluate fidelity, bundle size, startup time, diagnostics, schema drift, and access to complete source properties.

### Spike B: transformer projection

Build a micro two-winding and multi-winding transformer through canonical, single-wire, and multi-wire projections. Reject any model that requires a false pairwise connection.

### Spike C: static artifact shape

Measure one-file versus directory output for micro, small-real, and large fixtures. Confirm local-file browser behaviour and safe JSON embedding.

### Spike D: renderer baseline

Render the small-real fixture with native MapLibre layers and SVG. Record DOM element counts and interaction timings before considering deck.gl or Canvas.

## 18. Review cadence

- **Per slice:** a browser artifact and a five-minute critical-workflow review.
- **Weekly:** domain review focused on electrical truth and information usefulness, not visual polish alone.
- **At each tag:** update support matrix, known limitations, screenshots, and release notes.
- **After 0.1.0:** collect the top three failed or confusing user tasks before expanding scope.

Recommended review questions:

1. Is any visual connection electrically misleading?
2. Can the reviewer trace every visual asset back to its source record?
3. Can the reviewer move naturally between asset, connected bus, and terminal detail?
4. Which visible properties help make a decision, and which are noise?
5. Where does the view become unreadable or slow?

## 19. Success measures

The initial project succeeds when:

- A domain user can complete the critical workflow on the micro and small-real fixtures.
- All three views agree on asset identity and connectivity.
- Unsupported semantics are obvious rather than silently approximated.
- The alpha is deployed as static files and generated from Julia without a runtime server.
- Multi-wire fidelity is demonstrated before full-view polish.
- Performance and support limits are based on recorded measurements.
