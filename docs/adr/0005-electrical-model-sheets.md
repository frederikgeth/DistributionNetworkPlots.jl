# ADR 0005: electrical model interpretation and sheets

Status: implemented on `codex/electrical-model-sheets`, September 2026.

## Decision

Replace the camera-scaled multi-wire renderer with a read-only interpretation
module and model-sheet renderer. Retain the canonical port index, shared asset
selection, and legacy `multi` routes. Sheets compose HTML tables with SVG
electrical graphs; the full view additionally supports an ordered pinned atlas.

The selected asset's connections, governing model, operating data, differences,
and unresolved assumptions are visible together. Source metadata can expand.
Unclassified fields remain in an explicit Unrepresented model fields table.
The renderer does not solve power flow, compile geometry, fill missing matrices,
or claim a physically complete internal circuit.

## Contracts

Implementation was checked against the local BMOPFTools.jl checkout at
`ddd588f7`, particularly:

- `src/validation/schemas/draft_bmopf_schema.json`
- `src/analysis/load_models.jl`
- `src/io/nwinding.jl`
- `docs/src/results.md` and `ext/BMOPFOpfExt/results.jl`

These files establish the following conventions:

- Linecode series/shunt matrices are per metre; inline line matrices are
  absolute. Line impedance has exactly one source. Ratings can override the
  referenced linecode. Missing length prevents segment-total conversion.
- Nodal WYE, DELTA and SINGLE_PHASE maps have distinct arities and element
  ordering. Power arrays must match the elements; supported coefficient
  broadcasting is explicit. Missing load `model` has a visibly labelled
  constant-power default. Uppercase model names in existing examples are
  normalised for display.
- N-winding nominal voltages are coil voltages, unlike the line-to-line
  ratings of the two-bus three-phase transformer subtypes. `x_sc` is in ohms
  referred to winding 1's coil-voltage base, not per-unit.
- BMOPFTools terminal-keyed results have SI quantities and voltage angles in
  radians. Bus rectangular voltages are referenced to ground. Line currents
  are total end currents leaving the bus into the branch. Legacy flat arrays
  require their own references before deriving differences or phasors.

Every datum retains source paths. Invalid types, mismatched dimensions, unknown
endpoints, and conflicting sources are preserved. Matrices above order 16 use
an indexed list of all supplied entries rather than allocating dense matrices.
No phase role is assigned merely by cycling through positions or colours.

## Visual language and interaction

- Solid paths denote electrical connections; dots denote junctions; rings and
  terminal IDs identify ports. Grounding attaches to its actual local endpoint.
- Line conductors enter a shared series-coupling region. Both shunt sections
  are explicit, including missing/zero states. Matrix selection links row and
  column conductors and source evidence without hiding other entries.
- Load elements occupy WYE/DELTA/single-phase branches. Nominal P/Q, voltage
  references, separate active/reactive coefficients and the law remain visible.
  A voltage response control illustrates the declared law without changing data.
- Each transformer winding retains its own graph, ports and voltage convention.
  A malformed or unsupported winding becomes an explicit unresolved multiport.
- Generator/IBR sheets show controls and bounds, and apparent-power circles
  where the element mapping is established. These circles are only S bounds;
  other restrictions remain visible and are not claimed to form a solved
  capability region.
- Bus sheets list every incidence. Reusable records retain source fields without
  a fabricated electrical connection. Shunts use an explicit multiport model.
- Operating values are flattened to readable rows and keyed by identity.
  Comparison requires compatible units/references. Voltage phasors derive from
  terminal-keyed rectangular values.

Pinning preserves several sheets across selections, with ordering/removal.
Case-baseline capture copies the complete input case. A separate model JSON can
also provide the baseline. Differences include referenced linecodes, endpoint
terminal/grounding context and frequency, independently from result comparisons.
Case loading clears the atlas and comparison state to avoid accidental carryover.

HTML export is standalone, script-free and printable, including source data and
available operating values. SVG export inlines computed drawing styles so it
does not depend on the app stylesheet.

## Deliberate limits

Arbitrary autotransformer internal circuits, unknown device subtypes and
non-schema per-pole switch-state arrays remain visible as unsupported data.
No transformer vector group is guessed from a WYE/DELTA label. Missing neutral
terminals do not imply reduction. No implicit symmetry, shunt split, or missing
matrix coefficient is supplied by the viewer.

Source-parameter differences preserve array position and show changed terminal
maps rather than silently reordering parameter arrays. No voltage unbalance,
line loss, or limit violation is inferred from incomplete or unreferenced flat
result arrays. The existing result diagnostics remain available separately.

## Validation

- `test/electrical_model.mjs`: units, missing lengths, source conflicts, matrix
  dimensions, sparse handling, unknowns, element ordering, load responses,
  winding bases, field coverage and source differences.
- `test/model_sheets_browser.mjs`: linked keyboard selection, atlas operations,
  model comparison, safe exports, missing data, HTML escaping, terminal-keyed
  results and responsive layout.
- `test/browser_smoke.mjs`: existing navigation, overview layouts, inspector,
  result and large-case workflows with the replacement detail view.
- `test/runtests.jl`: self-contained Julia report embedding and safe data/title
  serialisation. The static bundler includes both new modules as well.
