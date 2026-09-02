# ADR 0004: Renderer and layout contract

Status: accepted for the prototype-to-beta transition  
Date: 2026-09-02

## Context

The viewer currently lives in a compact static application, but the three
views already have different correctness requirements. Geospatial placement,
single-wire topology, and terminal-level multi-wire detail must not gradually
become coupled through ad-hoc SVG code. Layout engines also need to remain
replaceable because deterministic placement is the offline fallback and ELK is
optional in some browsers.

## Decision

The viewer is organised around five boundaries:

1. **Canonical index** — `frontend/model.js` normalises BMOPF case records into
   entities, ports, ordered terminal maps, reverse bus indexes, support levels,
   and diagnostics. It owns schema interpretation and never emits SVG.
2. **Projection** — each view selects and arranges the canonical entities for
   its purpose. A projection may collapse detail, but it may not invent a
   missing port, terminal, coordinate, or connection. Multi-winding
   transformers remain a single entity with several winding ports.
3. **Layout** — deterministic and ELK layout code computes geometry only. It
   receives a projection graph plus explicit options and returns positions,
   routes, and diagnostics. It does not mutate the case or selection state.
4. **Renderer** — SVG helpers turn projection geometry into static markup. Any
   selectable visual element carries the canonical `data-kind` and `data-id`
   reference so the shared inspector and deep links remain renderer-agnostic.
5. **Interaction shell** — selection, result slices, search, camera state, and
   export controls are shared. Renderers report state through visible labels,
   tooltips, and diagnostics rather than private interaction conventions.

This contract is intentionally compatible with the current single-file browser
prototype. Extraction into `frontend/src/core`, `frontend/src/projections`,
and `frontend/src/renderers` is a packaging task, not a change to the domain
boundary.

## Layout cache policy

The versioned local cache is an optimisation, never source data. A cache record
is valid only when case identity, graph signature, route space, layout options,
and ELK version all match. A mismatch is reported as stale and deterministic
geometry is used. Manual bus positions and routes belong to the selected case
profile; they are not shared between cases.

Until a measured large-case workload requires more, one browser storage record
per case is sufficient. Future retention work must add an explicit bounded
profile count and eviction rule rather than silently growing local storage.

## Consequences

- The multi-wire renderer can expose terminal stacks and winding metadata
  without changing the case index or single-wire layout.
- ELK can be replaced or disabled without changing selection, SVG export, or
  result overlays.
- Tests can assert domain projections and visible labels independently of
  pixel-level styling.
- Replacing the prototype renderer packages remains a planned packaging step,
  while the correctness contract is now fixed and reviewable.
