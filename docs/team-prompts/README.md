# Five-person MewsOps implementation pack

Send each person 00-shared-contract.md plus their numbered assignment. This pack defines proposed contracts for implementation, not existing working functionality.

- 01: Backend database and fixtures
- 02: Backend services, authorization and approvals
- 03: Agent intelligence and multimodal evaluations
- 04: API integration and shared contracts
- 05: Reference-led UI, volunteer and staff

## Coordinator responsibilities
Freeze contract v1 with API owner first. Review every PR, integrate database before dependent services, then agent/API and UI. Each lane owns its tests and handoff; no separate QA role. Coordinator owns cross-lane acceptance, deployment verification, and demo readiness. Humans own scope and design choices.

## Parallel sequence
First 45 minutes: API owner publishes contracts; database owner publishes repository signatures; other lanes scaffold against fixtures. First integration checkpoint: phone report persists and appears in staff list. Second: agent proposes typed evidence and alert, reviewer confirms identity, census updates. Final: distinct photos/same cat, missing/adopted approval, feeder coverage, TNR unknown, privacy checks and failure recovery.

## Scope cuts
One runtime agent, simple dashboard, fixed synthetic input bundle and phone form. Defer map, sponsor portal, voice, arbitrary export parsers and autonomous background operations. Preserve last-feeding behavior and different-photo identity review because they are core challenge outcomes.

## Shipping gate
All five lanes typecheck and pass relevant tests; integrated flow works against real local persistence; actual OpenAI call tested separately from labeled fixtures; public repo contains no secrets; deployed persistence survives restart/redeploy before any durability claim. No production or scoring guarantees.
