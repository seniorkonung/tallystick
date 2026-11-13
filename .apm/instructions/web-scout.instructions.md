---
description: Scopes web/ as a fast scout app for the main app, exempt from the rigorous process.
applyTo: "web/**"
---

### Web scout app

`web/` is a fast scout for the main app: a PWA the user uses daily with real data and changes on the fly to test product and visual ideas in practice. The main app is built separately, slowly and rigorously. Optimize `web/` for speed of iteration. The human directs the following deviations for this directory only:

- Do not apply production-readiness, process-discipline, or the OpenSpec workflow.
- Do not write specs, plans, or task documents. Do not use TDD or review skills.
- Do not report justifications for each element; keep the code minimal instead.
- Prefer speed of iteration over type rigor; plain TypeScript is enough.

Record significant decisions about `web/` as ADRs in `web/docs/adr/`, never in the repository-level `docs/adr/`, which belongs to the main app.

Still apply: language preferences, commit conventions, and domain terms from `CONTEXT.md`.
