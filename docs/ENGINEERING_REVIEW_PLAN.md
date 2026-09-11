# Engineering review workspace

Goal: an engineer should see what was assessed, understand why a value is coloured, investigate its source and export a finding without losing context.

## Implementation sequence

1. **Shared engineering interpretation.** Route loading and voltage-deviation values through the strict electrical interpreter in every renderer, table and tooltip. Preserve zero, reject coercion of missing/invalid data, retain overloads and suppress numeric colours for incompatible case pairing. Remove inferred voltage bases and unsupported severity claims.
2. **Explicit assessment lifecycle.** Distinguish no results, scenario required, pairing mismatch and assessed results. Count passed/violated supported checks separately from unassessable checks, unsupported checks and model findings. Never display zero violations as a completed assessment when no assessment ran.
3. **An investigation workspace.** Keep the regional diagram above the fold. Provide question presets (connectivity, voltage, loading, supplied-limit assessment), a compact result/reference bar, and a bounded evidence drawer alongside the map. Keep explanations available in contextual disclosure, with critical missing/pairing/coverage states visible. Reuse the existing selected-element inspector and sheet view.
4. **A precise visual language.** Use discrete, labelled magnitude bins matching the map. Keep selection distinct from values. Identify clusters as aggregates and structural components as structural, not energised networks. Replace renderer-support counters in the primary UI with relevant case information.
5. **Self-contained exports and findings.** Export SVG/PNG figures with case, scenario, pairing, quantity/reference, scale and coverage. Allow issue evidence to be pinned to a session review sheet and exported with its case/result context and source paths.
6. **Verification.** Add regressions for semantic consistency, assessment lifecycle, workspace/mobile layout and exported context. Run model/build, browser and Julia suites, then probe Springfield and the supplied ENWL cases locally.

## Acceptance criteria

- Missing loading is never converted to zero; loading above 1 remains visible.
- A small SI voltage does not imply a per-unit deviation in any view.
- A case without results says operating assessment has not run, without a flood of incomplete operating findings.
- Assessment counts identify check outcomes and limitations; no unsupported constraint is presented as passed.
- On a desktop viewport, the regional diagram is visible without scrolling through instructions; evidence opens beside it and becomes a bounded section on mobile.
- A saved figure carries the context needed to interpret its measurements without the live app.
- Model data, result data and private fixtures are not modified or committed.

## Scope

This is a reader and investigation workspace, not a solver or a certification of network safety. It retains existing supported voltage/current checks. Feeder profiles and additional constraint families remain separate future work.

## Completion record

Implemented on `codex/engineering-review-workspace`:

- Shared strict loading/deviation interpretation across map, single-wire, tables and tooltips; overloads remain visible and missing values are not coerced to zero.
- Explicit assessment states and individual check outcomes, with model findings and unsupported groups counted separately. New case imports clear stale result/comparison attachments; embedded-report metadata is bound to its original case.
- Question presets, in-map search/scenario controls, a bounded evidence drawer, contextual documentation and a larger diagram viewport. Existing terminal tracing and selected-element sheets remain available.
- Discrete magnitude legends, structural-component terminology, aggregate labels with leaders to mean bus coordinates, and technical renderer counters removed from the main class table.
- Session-pinned findings with JSON export, plus SVG/PNG figures carrying context, coverage, assessment scope, colour bins and embedded drawing styles.

Validation: 17 build/model tests, seven browser suites, 68 Julia assertions, and successful local probes of Springfield plus all 25 ENWL cases. Browser checks include stale results/report metadata, cross-view loading consistency, assessment lifecycle/counts, mobile overflow, pinned findings, and SVG/PNG exports. Private case/result data is not committed. Review pins are session-local until exported; check families remain the explicitly supported voltage/current constraints.

## Engineering-task acceptance review

- Springfield and 25 ENWL cases: no-result states, bounded rendering and geographic drilldown pass without browser errors.
- Supplied-limit investigation: selecting the voltage violation exposes the affected terminal, measured value and exact limit path.
- Scenario transition: switching from a violation to missing terminal results removes the violation and records two unassessable checks; terminal selection remains consistent.
- Case transition: opening another case clears operating results. Pinned findings retain their original case, scenario, result, value and limit rather than inheriting the new context.
- Export: downloaded SVG parses independently, PNG renders, and case/scenario/reference/coverage context accompanies the figure. Review JSON preserves the selected finding's evidence.

These are automated interaction checks plus visual inspection of the generated figure, not a claim of independent user testing or solver validation.
