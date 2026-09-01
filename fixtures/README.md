# Case fixture provenance

Case files are data artifacts, not source code. Their licenses are tracked per
case and must never be inferred from the repository's BSD 3-Clause code license.

## Original cases

`micro/micro_bmopf.json` is authored in this repository and is licensed under
CC BY 4.0. Its attribution and source are recorded in the JSON `meta` object.

`micro/micro_bmopf_result.json` is an authored, BMOPFTools-compatible result
sidecar for the micro case. It uses the same CC BY 4.0 attribution and includes
illustrative objective, termination, bus voltage, device loading, and dispatch
fields so the browser result adapter can be exercised without redistributing a
solver-generated dataset.

The result fixture also includes illustrative solution-profile findings so the
Diagnostics view can exercise clickable bound-violation, near-active-bound, and
residual records, plus an explicit bus voltage-deviation value for result-aware
overview styling.

`micro/micro_bmopf_multinetwork_result.json` exercises explicit selection of
multiple `nw` result slices. The viewer refuses to guess a slice and requires
the user to choose one before showing asset metrics.

## Reused cases

Cases reused from another initiative must remain under their source license.
Keep each reused case in its own directory and include:

- the exact source license text or a checked-in license file;
- the source URL, citation, or repository and the retrieval/version details;
- required attribution and any notices from the source project; and
- `meta.license`, `meta.attribution`, and `meta.source` fields in the case when
  the schema permits them.

Do not copy a case into `fixtures/micro/` unless it is authored here or its
provenance has been reviewed and documented.
