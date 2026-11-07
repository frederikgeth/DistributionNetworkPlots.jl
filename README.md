# DistributionNetworkPlots.jl — discontinued

> [!WARNING]
> **This project is no longer developed or maintained. It has been superseded by
> [Tellegen](https://tellegen.dev/).**
>
> For new work, use **[tellegen.dev](https://tellegen.dev/)**. This repository is
> retained for historical reference, not as an actively supported tool.

## The successor: Tellegen

[Tellegen](https://tellegen.dev/) is an open-source framework for interactive
power flow (PF) and optimal power flow (OPF) studies in the browser. It goes
beyond inspecting network cases and precomputed results: users can change
nodal demands or line ratings, preview their effects using sensitivities, and
then recompute the solution. Its numerical tools run through WebAssembly,
keeping local case files and results on the user's device.

The framework includes a numerical engine, reusable browser components and
saved studies. Its approach and evaluation are described in the preprint
[*Interactive Power Flow in the Browser*](https://arxiv.org/abs/2610.01922),
by Samuel Talkington, Frederik Geth, Qian Zhang, Le Xie and Skyler Liu (2026).

- **Use Tellegen:** [tellegen.dev](https://tellegen.dev/)
- **Documentation and supported workflows:** [Tellegen documentation](https://eigenergy.github.io/tellegen/)
- **Source code and development:** [eigenergy/tellegen](https://github.com/eigenergy/tellegen)
- **Preprint:** [arXiv:2610.01922](https://arxiv.org/abs/2610.01922)

## About this legacy repository

DistributionNetworkPlots.jl explored browser-based inspection of BMOPF
distribution-network JSON cases and results, with Julia-generated static HTML
reports. It provided geographic and single-wire views, electrical model sheets,
terminal tracing and source-data inspection alongside
[BMOPFTools.jl](https://github.com/frederikgeth/BMOPFTools.jl).

The code, fixtures and documentation remain available for understanding and
reproducing that work. The documentation below describes the discontinued
prototype; the roadmap is historical, not a commitment to future development.

- [Frontend prototype notes](frontend/README.md)
- [Architecture](ARCHITECTURE.md)
- [Historical roadmap](ROADMAP.md)
- [Fixture provenance](fixtures/README.md)

## Licensing and case provenance

The source code remains available under the [BSD 3-Clause License](LICENSE).
Original BMOPF case files authored in this repository, including the micro
fixture, are released under [CC BY 4.0](LICENSE-DATA). Their `meta.license`,
`meta.attribution` and `meta.source` fields are part of the case provenance.

Cases reused from other projects retain their own licences and attribution
requirements; they are not relicensed by this project. See
[fixture provenance guidance](fixtures/README.md).
