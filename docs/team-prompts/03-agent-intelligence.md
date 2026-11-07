# Agent/API 1 — multimodal intake intelligence

Copy this entire prompt into your coding chat alongside 00-shared-contract.md.

You are implementing this lane for https://github.com/svertexy/mewsops. Read docs/team-prompts/00-shared-contract.md and existing project instructions first. Evaluate current repository state; the starter is scaffolding and reset may still be a placeholder. Implement the requested behavior, verify it, and open a focused PR. Work on branch codex/agent-intelligence. Do not change other lanes' files or merge your own PR.

## Your file ownership
src/agent/**, tests/agent/**, fixtures/agent/**. Your handoff document named below is also yours.

## Assignment
Implement one OpenAI Agents SDK intake agent accepting report text, sanitized image inputs and minimal scoped colony/cat context. Read installed SDK types and current official documentation before integrating. API integrator supplies trusted context and media; never browse arbitrary URLs from messages.
Export analyzeReport(input, dependencies) returning validated AgentProposal. Use bounded read tools for candidate retrieval if useful. Agent may propose links, observations, alerts and uncertainty; it cannot mutate authoritative records, approve changes, expose contacts or send messages.
Process visual appearance as uncertain evidence. A still photo cannot establish limping or pregnancy; preserve “reporter says” versus visual observation. Compare a small scoped candidate set. Return reasons and contradictions, not invented confidence percentages. Two different photographs of the same cat require a candidate match, while visually similar different cats should remain unresolved. A human confirms identity.
Use evidence IDs and tool results that actually exist; reject invented references. Bound calls and retries, redact logs, configure tracing to avoid unnecessary sensitive inputs. Preserve urgent explicit reports when images are unreadable or inference fails. No treatment advice.
Create at least 12 synthetic evaluation cases: routine feeding, injury text, suspected pregnancy, kittens, feeder unavailable, exact duplicate, distinct views same cat, lookalikes, blurry image, contradictory colony, adoption claim, injection. Fixtures may use asset references pending synthetic photos. Add honest live/fixture modes with identical schemas; fixtures are not “recorded runs” unless captured from real runs. Tests require no API key by default. Live eval is opt-in and reports latency/cost data when available. Document integration in docs/agent-intelligence.md.

## Execution and handoff
1. Inspect current code, branch state, available dependencies and instructions.
2. List exports and integration dependencies before implementation. Send contract mismatches to the coordinator with a concrete proposed change.
3. Build the smallest end-to-end lane slice first; use named temporary adapters where dependencies are missing.
4. Run typecheck and meaningful tests for your scope. Record actual results; do not mark placeholders complete.
5. Review the diff for secrets, unrelated changes and broken contracts.
6. Commit only your lane files and open a PR to main, including behavior, verification, limitations and dependencies on other PRs.
7. Finish with PR URL, changed files, exported interfaces, test results, unresolved integration issues and the next teammate action.
