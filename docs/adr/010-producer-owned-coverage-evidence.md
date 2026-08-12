# ADR 010: Producer-owned coverage evidence

- Status: Accepted
- Date: 2026-08-12
- Scope: Coverage evidence ownership, exact baselines, and combined coverage reporting
- Supersedes in part: [ADR 006](./006-test-execution-model.md) (merged coverage as the exact baseline verdict)

Exact coverage verdicts preserve producer identity: Node-owned runtime modules compare only with
fresh Node Vitest evidence, and Storybook controller modules compare only with fresh Storybook
Chromium evidence. Every source has one reviewed evidence treatment, while only appropriate
runtime modules have an exact coverage owner; new source fails closed until classified, and an
ownership change requires architectural review.

Rendered UI remains governed by story discovery, execution, play assertions, and axe under
[ADR 005](./005-testing-and-storybook.md), with its percentages informational. Cross-environment
execution is allowed but cannot rescue an owner verdict. Combined owned runtime reach is
informational, and the optional combined automation reach is withheld when Node and Storybook
maps are incompatible. Fresh owner baselines begin a new policy contract and are not compared with
the former merged tuples as improvements or regressions.

## See also

- [Testing and validation](../testing-and-validation.md)
- [Coverage evidence treatment audit](../coverage-evidence-audit.md)
- [Implementation plan](../plans/producer-owned-coverage-evidence.md)
