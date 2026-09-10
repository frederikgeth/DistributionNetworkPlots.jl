# Electrical visual language

Design proposal, 10 September 2026. The implemented scope is recorded in
[ADR 0005](adr/0005-electrical-model-sheets.md).

## Change the unit of design

An asset becomes an electrical model sheet, with four simultaneous parts:
connection drawing, governing parameters, available operating values, and
unresolved assumptions. These are reading regions on one surface, not tabs.
The inspector is reserved for ancillary metadata and long source records.

This expands the product from a network plotter to a model explanation and
review environment. Network diagrams provide location; sheets explain physics
and data. A tray can pin several sheets for comparing connected devices or
scenarios, keeping the same terminal identities and notation throughout.

## Grammar before styling

| Visual primitive | Exact meaning | Prohibited ambiguity |
| --- | --- | --- |
| Solid path | Modelled electrical connection | Never use it for magnetic or numerical coupling |
| Junction dot | Shared electrical node | Mere line crossing never creates a junction |
| Terminal ring plus ID | An external port terminal | A terminal label does not establish a phase role |
| Interrupted contact and blade | Open switch contact | Unknown state needs a visible question mark and label, not the open glyph |
| Element inserted in a path | An electrical branch law or impedance | WYE/DELTA drawings must not short terminals with bare wires |
| Winding symbol within its connection graph | Winding branch | Do not draw galvanic continuity across isolated windings |
| Labelled coupling region | Shared magnetic or matrix relationship | No invented physical conductor for a mutual matrix term |
| Ground symbol with explicit attachment | Grounding at that node | No grounding implied by a neutral name or drawing position |
| Value + unit + reference | An interpretable quantity | A voltage without its reference is incomplete |
| Explicit “not supplied”, “defaulted”, “derived”, or “unsupported” | Data interpretation state | A dash cannot simultaneously mean zero, missing, and not applicable |

Use largely neutral circuit strokes. Colour has one job at a time: cross-view
selection, or a clearly labelled result scale. Persist terminal IDs and local
phase-role labels; do not rely on red/green/blue as electrical truth. Neutral
conductors use the same solid connection stroke as other conductors and an N
role label when established. Dashed styling is not a substitute for semantics.

Group terminals belonging to one bus with whitespace and a bracket outside the
electrical drawing, never a vertical busbar connecting different phases.
Distinguish physical conductor geometry, electrical connectivity, and schematic
layout. Show a geometry inset only when the data establishes actual geometry.

## Redraw the elements

**Line/cable:** conductors enter a shared, explicitly labelled coupled-series
region. The full labelled matrix sits immediately beside or below it; self
terms alone do not describe the model. Display both end-shunt sections, including
explicit missing/zero states. Show ordered endpoint maps, length, source basis,
frequency, ratings, and neutral representation. Selection links a matrix term
to its row and column conductors. Do not turn every off-diagonal term into an
extra wire, resistor, or capacitor. For general shunt matrices, use a labelled
multiport admittance representation unless a valid branch realization is known.

**Transformer:** draw the actual winding connection graphs, each with external
terminal IDs and winding branches. Place nominal voltage and voltage convention,
rating, tap and connection beside each winding. Couple windings as one device;
show pairwise impedance data as a table indexed by winding IDs with its base.
For three or more windings, add winding sections within the shared device, not
pairwise transformer copies. Vector group, polarity, internal star-point export,
and grounding require evidence. Unknown topology is a named multiport model
with an explicit unknown state, not a guessed WYE drawing. Autotransformers need
their own conductive topology; an isolation motif cannot be universal.

**Load:** show one branch per electrical load element. A delta has three loaded
edges; a wye has loaded legs to its star point. Attach P/Q, voltage reference,
nominal voltage, and model law to those elements. ZIP needs separate active and
reactive coefficients. A small voltage-response demonstration can sit alongside
the unchanged nominal data; label it as a model calculation, never a solved
network operating point. Source-schema element ordering must be established
before mapping arrays to edges.

**Generator/IBR:** show the external connection graph, controlled quantities,
setpoints, and capability boundary with any available operating point. Control
mode is visible text. Generic machine or inverter badges are identity cues;
they do not imply an internal physical circuit absent from the model.

**Switch:** show each modelled contact and mapping, including permutations.
Write common device state once when it applies to all contacts; independent
per-pole state must be supported by data. Put unequal ratings next to their
contacts. Unknown and out-of-service are separate states from open.

**Shunt/ground:** show the terminals and admittance model with its reference.
Distinguish an ideal ground constraint from an impedance to ground. Never
silently infer a physical resistor network from arbitrary admittance entries.

## Keep important information visible

A schema adapter declares a field manifest: every source field has a destination
as visible model content, visible operating data, evidence, or ancillary
metadata. An unclassified electrical field appears in an “Unrepresented model
fields” block until supported. It cannot vanish into raw JSON without notice.
This is a coverage contract rather than a confidence score.

Always show: model family, terminal mapping, connectivity exceptions, grounding,
control law, parameters required to interpret that law, unit/reference/base,
applicable limits, available operating values, and consequential unknowns.
Long provenance and ancillary metadata may expand; essential interpretation
never depends on hover. Selecting enriches or highlights an already visible
fact. It does not reveal the existence of coupling or a model exception.

Repeated values can be factored with an explicit scope: “all three branches:
9 kW + j1.8 kvar”. Display every deviation next to its element. Preserve the
complete labelled data table on the sheet for audit and export.

Use space to manage complexity: enlarge or stack sheets, align data to elements,
and allow labelled matrix scrolling. Never shrink text until it is unreadable.
On the network overview, show aggregate model facts and exceptional states
with an explicit indication that more detail is represented in the sheet.
A complete network cannot show every scalar at once; do not pretend zoom can
solve that. The complete selected model remains readable in an adjacent sheet.

## Two useful scope expansions

1. **Model atlas:** select a route or equipment group to pin its sheets in order.
   Compare terminal mappings, bases, grounding, and control laws without losing
   one device when selecting its neighbour. Export the same sheets for review.
2. **Model difference sheets:** align a before/after pair by electrical identity.
   Mark changed terminals, parameters, and laws on the diagram; retain exact
   values in aligned columns. Keep case-model changes separate from result
   scenario changes.

Do not add a new solver or assume the renderer can infer an unknown physical
model. These expansions concern inspecting and explaining available data.

## Prove the language before rolling it out

Build a small specimen suite: explicit neutral with one-end grounding; a coupled
line with a permutation; all-zero versus missing shunts; a delta ZIP load with
unequal elements; WYE/DELTA and three-winding transformers; an autotransformer;
independent versus common switch state; arbitrary terminal IDs; missing voltage
basis; unknown component subtype.

Review drawings without opening the inspector. Ask engineers to identify every
electrical node, load element, coupling, unit base, and unsupported assumption.
They should be able to predict what a model parameter changes and trace it to
its source. A diagram that looks familiar but invites a wrong electrical
interpretation fails. Validate the field manifest against every fixture, and
check the same sheet in print, grayscale, keyboard interaction, and narrow view.

The conversation specimens use synthetic declared models, not inferred BMOPF
semantics. Their winding and load drawings illustrate the proposed grammar.
Upstream references informing the distinction between connection and behaviour:
[EPRI transformer properties](https://opendss.epri.com/Properties16.html),
[EPRI load properties](https://opendss.epri.com/Properties7.html), and
[EPRI power conversion elements](https://opendss.epri.com/PowerConversionElements.html).
BMOPF-specific conventions still require adapter/schema verification.
