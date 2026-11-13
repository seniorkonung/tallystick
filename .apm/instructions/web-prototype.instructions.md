---
description: Scopes web/ as a disposable design prototype exempt from production rules.
applyTo: "web/**"
---

### Web prototype

`web/` is a disposable PWA prototype that replaces design mockups and serves as a test bed for product ideas. It is a design artifact, not a delivered capability. The human directs the following deviations for this directory only:

- Do not apply production-readiness, process-discipline, or the OpenSpec workflow.
- Do not write tests, specs, plans, or task documents. Do not use TDD or review skills.
- Do not report justifications for each element; keep the code minimal instead.
- Prefer speed of iteration over type rigor; plain TypeScript is enough.

Still apply: language preferences, commit conventions, and domain terms from `CONTEXT.md`.

Never move code from `web/` into the production app. Only validated product decisions move, through docs and OpenSpec.
