# Agent intelligence handoff

## Contract and behavior

`src/agent/index.ts` exports `analyzeReport(input, { signal })`, returning a validated `AgentProposal` or rejecting. It matches the API PR's `AnalyzeReportInput`: the report ID is also the text evidence ID; images are sanitized PNG bytes encoded as raw base64 and keyed by attached private-media IDs; colony candidates are server-selected; cat candidates carry their colony ID and may include a short synthetic `knownDescription`.

The agent has no tools or handoffs. It can only use input IDs and evidence, returns no confidence percentages, and does not approve or mutate anything. Reporter statements cite the report ID. Visual observations and any cat suggestion cite supplied image IDs. A cat suggestion additionally requires an image and a supplied appearance description. The seed has no vetted appearance descriptions and reference photos are unavailable, so the current same-cat and lookalike image comparisons remain unresolved. Empty `catCandidates` is the correct result for those cases.

The output schema is strict and is checked again against the scoped input before the proposal is returned. Invalid IDs, wrong report IDs, reporter observations without text evidence, visual observations without an image, or ungrounded cat suggestions reject the whole inference. The API retains the saved report and any immediate urgent alert if that rejection or a provider failure occurs.

## Modes and configuration

The API's `MEWSOPS_ANALYSIS` chooses its adapter:

- `fixture` uses the API's own synthetic report fixture and does not load this module.
- `agent` imports this named `analyzeReport` export.

When `MEWSOPS_ANALYSIS=agent`, `MEWSOPS_AGENT_MODE` chooses this module's behavior:

- `live` calls the Agents SDK and is the default. It requires server-side `OPENAI_API_KEY`; a missing key or failed inference returns an explicit unavailable error. `MEWSOPS_AGENT_MODEL` selects the model; the default is `gpt-5.4-mini`.
- `fixture` returns a clearly labeled deterministic reporter-only proposal and requires no key. Tests can inject a hand-authored proposal map through the optional dependency argument. These are evaluation targets, not recorded model runs.

The SDK run uses one turn, forwards the API's `AbortSignal`, and disables tracing so report text and image data are not exported in traces. The model receives images only as in-memory data URLs built from the API-supplied PNG bytes. It cannot fetch URLs or access local files.

## Synthetic evaluations

There are 12 hand-authored synthetic cases under `fixtures/agent/`: routine feeding, injury report, suspected pregnancy, reported kittens, unavailable feeder, duplicate image bytes, distinct views of one cat, lookalike cats, blurry image, conflicting colony clue, adoption claim, and prompt injection. The fixtures and expected proposals are deterministic tests; none is represented as an observed model run.

Four visual cases are explicitly marked `unresolved_missing_synthetic_assets`: duplicate bytes, two different views of the same cat, lookalikes, and blur. The team has not supplied approved synthetic reference photos or vetted appearance descriptions, so those fixtures intentionally carry no image bytes and return no cat match. They test the safe unresolved outcome, not visual accuracy. To complete that evaluation, add actual approved synthetic images and descriptions with provenance to the fixture manifest, then run the opt-in live smoke/evaluation separately.

## Verification and local integration

No API key is needed for `tests/agent/analyze-report.test.ts` or `npm run typecheck`. To run an end-to-end local API demo, combine the API integration PR with this branch, install both root and `src/api` dependencies, keep the key in an ignored local environment file or process environment, and run:

```sh
MEWSOPS_DEMO=1 MEWSOPS_ANALYSIS=agent MEWSOPS_AGENT_MODE=fixture npx tsx src/app.ts
```

This exercises API loading with the agent's deterministic adapter, not live inference. For one bounded real model call, set `MEWSOPS_AGENT_MODE=live` and provide `OPENAI_API_KEY` only in the server process environment; submit a synthetic report with text and no photos if no approved photos are available. A text-only run can verify report attribution and schema, but cannot demonstrate image matching. Never put keys, real reports, or raw base64 in a PR or logs.

### Completed verification for this handoff

The agent lane was combined with API PR #1 at commit `cd2bc34db46d7fa278ac301d44969671098ef8ff` in a temporary checkout. TypeScript typecheck passed, and Vitest passed all 16 agent/API tests across 3 files. A bounded direct live call through the Agents SDK passed using `gpt-5.4-mini` (3.3 seconds; 976 total tokens; the SDK did not return dollar cost). The API demo workflow smoke also passed through volunteer submission and staff processing: the report became `needs_review`, urgency was `same_day_review`, the reporter observation cited the generated report ID, and cat identity remained unresolved because the test supplied no photo or vetted descriptions. The smoke used synthetic injury text only; it does not validate live visual matching. The generated test report ID was `fb0c850e-2692-4877-a7b3-6946de43309f`.

## Known limitations

- Live visual accuracy, duplicate-file handling through actual visual evidence, two-view identity matching, lookalike rejection, and blur handling remain unverified until approved image assets and descriptions exist.
- Agent proposals remain unconfirmed until a staff member reviews them.
- This handoff covers the agent lane only; API, session, media, UI, persistent hosted storage, and deployment claims remain owned by their respective lanes/coordinator.
