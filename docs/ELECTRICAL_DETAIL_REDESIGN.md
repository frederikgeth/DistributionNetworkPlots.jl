# Electrical detail: proposed replacement for multi-wire

Status: original design proposal, 10 September 2026. See
[ADR 0005](adr/0005-electrical-model-sheets.md) for the implemented scope.

Design revision: the user's request to expose important information directly
supersedes the separate-view composition below. See
[Electrical visual language](ELECTRICAL_VISUAL_LANGUAGE.md): connections,
parameters, results, and unresolved assumptions coexist on a model sheet.
The semantic requirements and acceptance cases below still apply.

## Product decision

Replace the multi-wire feature with an Electrical detail workspace opened from
an asset in the single-line diagram. Keep network context and selection history.
Offer a full-width detail mode for matrices and comparisons. Organise detail
around connections, model parameters, operating results, and source evidence.
Each view answers a different engineering question; selecting a terminal or
parameter links the views.

The primary user task is to explain an asset's electrical model and trace its
numbers back to data. A visually plausible circuit alone is insufficient.

## Findings in the current implementation

- `frontend/projections/multi-wire.js:conductorVisual` assigns unknown terminals
  A/B/C by position. It also combines grounding at either endpoint into a single
  conductor classification. Terminal identity, phase role, and local grounding
  need separate representations.
- `branchModel` uses a scale of 1 when a referenced linecode has no finite
  length. The renderer still labels the result in absolute ohms.
- `branchModel` has one `shuntPresent` flag for absent, all-zero, and very small
  data. The renderer labels the false case “Pure series branch”. Missing data
  cannot establish that model unless the source schema supplies a documented
  default.
- `frontend/app.js:drawMulti` embeds matrix values in SVG at 8–9px font sizes.
  Connectivity and numerical inspection compete for the same space.
- The two-winding view describes ordered port entries as phase continuity.
  Winding terminal association does not establish direct galvanic continuity
  or a transformer phase shift.
- The micro fixture's `line_main` references `lc_main`, which provides ratings
  but no impedance entries. It is a useful incomplete-data acceptance case.

## Interaction design

The header identifies the asset, endpoints, model family, and active scenario
when results exist. A compact connection strip stays visible above detail.
Use source terminal IDs as primary labels. Phase names are secondary and carry
an explicit or inferred origin. Arbitrary terminal IDs stay arbitrary.

### Connections: what is connected to what?

Draw individually selectable conductor lanes between ordered terminal stacks.
Show permutations with crossings and explicit endpoint labels. A crossing is
not a junction. Ground symbols attach to the actual terminal at the actual bus;
show ideal grounding separately from impedance grounding. Neutral role is
independent of grounding. Unknown or unmatched endpoints remain visible as
unresolved stubs, with a link to the offending field.

Selecting a bus opens a terminal incidence table: terminal, connected asset and
port, switch state, and grounding evidence. Expand one selected route locally
instead of making a large expanded network the default.

### Parameters: what equations and numbers define the asset?

For a line, show the coupled matrix model with selectable Series Z, From shunt,
and To shunt sections. Use HTML tables with readable values and both axes
labelled by conductor identity and source order. Offer real/imaginary and
magnitude/angle representations; retain full precision in copy/export.

Selecting Z[i,j] highlights conductor i and conductor j in the connection strip
and exposes its meaning: current on conductor j contributes to the series
voltage drop on conductor i. Diagonal entries are self terms; off-diagonal
entries are mutual terms. They are not additional physical wires. Optional
matrix shading supplements exact numbers; its scale and units stay visible.

Show source units and a segment-total display only when conversion is justified.
Every derived cell exposes source asset, field path, raw value, length, unit
conversion, and resulting value. Do not silently prefer a linecode over an
inline override: resolution must follow the adapter's documented schema rules.

Display from/to shunt matrices independently. Distinguish supplied zero,
schema-defaulted zero, unavailable, invalid, and nonzero. Never introduce an
equal split, ground connection, or reduction that the model does not establish.

### Operating point: what is the model doing?

Align available voltages, currents, P/Q and applicable ratings to terminal or
device-element identity. Label voltage reference (phase-neutral, phase-phase,
or ground), current direction, power sign convention, units, and scenario/time.
Provide phasors only when compatible magnitudes, angles, and references exist.
Keep missing metrics visible as unavailable rather than calculating guesses.

Compare scenarios using a shared terminal order. A model-parameter comparison
is separate from an operating-point comparison. Derived losses, unbalance, or
voltage-drop decompositions need documented definitions and adequate inputs.
For a pi model, series-current calculations must account for end shunts; do
not treat reported terminal current as series current without verification.

### Evidence: why should I trust this interpretation?

Every selected term opens its source path and derivation beside the value.
Group actionable findings by unresolved mapping, unavailable parameters,
invalid dimensions, and unsupported semantics. Preserve access to raw records.
Avoid an aggregate confidence score. Each finding explains which interpretation
or calculation it prevents and links to the exact field.

## Asset-specific content

| Asset | Detail that matters |
| --- | --- |
| Line/cable | Ordered terminals, full self/mutual matrices, length and units, frequency, explicit/reduced/unknown neutral representation, end shunts, per-conductor ratings |
| Switch | Contact pairs and open/closed/unknown state; show per-pole state only if supplied, otherwise identify common device state |
| Transformer | One panel per winding, bus and terminal map, configuration, rated voltage and its convention, ratio/taps, impedance base, vector group/shift only if established; preserve multi-winding coupling |
| Load | Actual electrical elements such as 1–n or 1–2, WYE/DELTA where known, P/Q and nominal voltage per element, model law and ZIP coefficients |
| Generator/IBR | Connection elements, setpoints, control mode and applicable capability limits; no invented internal circuit |
| Shunt/grounding | Connected terminal set, admittance representation, reference and physical grounding evidence |
| Bus | Terminal incidence, grounding, nominal voltage context, available terminal results |

Do not infer a transformer vector group from WYE/DELTA alone. Do not label a
three-terminal matrix Kron-reduced merely because neutral is absent. Primitive,
reduced, and unknown representations must remain distinct. EPRI documents
linecode matrices per unit length and the assumptions of neutral elimination:
[LineCode](https://opendss.epri.com/LineCode1.html) and
[Cable Modeling](https://opendss.epri.com/CableModelinginOpenDSS.html).
These references inform the design; BMOPF adapter semantics must be verified
against its own schema before implementation.

## Implementation boundaries and sequence

Keep the existing canonical asset/port index and selection machinery. Add a
model interpretation layer between schema adapters and presentation. A datum
needs value, unit, availability state, origin, source path, and derivation.
Matrices additionally need ordered conductor axes and representation metadata.
Connectivity, conductor role, grounding, and winding membership are distinct.

1. Implement line and bus detail with linked connectivity, matrices, and source
   evidence. Fix unknown-phase, missing-length, and absent-shunt semantics here.
2. Add switch, transformer, and nodal-device presentations against explicit
   adapter contracts. Replace the multi-wire entry point with Electrical detail;
   preserve old deep links as aliases and support open/collapse/full-width.
3. Add operating-point alignment and comparisons where result adapters establish
   units, references, and indexing. Export labelled tables and connection SVGs
   with scenario and provenance metadata.

The first usable slice should let an engineer trace one mutual impedance from
its table cell to both conductors and its source in one interaction. The
conversation prototype illustrates this slice using labelled synthetic data.

## Acceptance and engineering review

- Existing micro line: ratings remain usable; missing impedance is explicit;
  no pure-series claim follows from absent shunt data.
- Four-conductor line with mutual terms and a permutation: matrix selection
  highlights the correct physical conductor mappings without reordering data.
- Missing length: per-length values remain available; segment totals are
  unavailable. Explicit zero and absent matrix entries render differently.
- Arbitrary terminal names and one-end-only grounding: no fabricated phases or
  remote grounding. Malformed maps and matrix dimensions remain inspectable.
- Three-winding and unspecified-configuration transformers: no false pairwise
  wiring, inferred vector group, or invented internal connection.
- DELTA load: element quantities attach to terminal pairs, not presumed phases.
- Scenario comparison: terminal identity, units, reference, and time remain
  explicit; incompatible quantities are not subtracted.
- Keyboard selection performs the same linking as pointer selection. Tables
  stay readable in the narrow pane without shrinking labels into a diagram.

Review with power engineers using tasks: trace a permutation, explain a mutual
term, identify an unsupported model assumption, and locate a changed terminal
result. Assess correct answers and source traceability before visual polish.
