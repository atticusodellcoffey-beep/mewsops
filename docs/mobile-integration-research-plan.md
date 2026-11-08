# Mobile-first integration research and next steps

## Product direction

MewsOps is intended to be a mobile-first responsive website, usable on phones and desktop. The website and add-to-home-screen/PWA behavior have not yet been implemented or verified in this repository. A native App Store application is not part of the current plan. Volunteers need a quick phone form for a fictional colony, report and photo; staff need review and colony views usable on both phone and desktop.

## Verified repository state

- `main` at `8e1dbee`: SQLite-backed backend and deterministic CLI demo; no checked-in frontend, live agent or HTTP server.
- Open API PR [#1](https://github.com/svertexy/mewsops/pull/1), head `cd2bc34`: demo HTTP routes, private local media handling, session scaffolding and agent adapter; not merged into main. The session adapter and local demo personas are not production authentication. The server binds loopback by default and has not been verified from a physical phone.
- Teammates 3 and 4 described a proposed `analyzeReport(input, { signal })` contract in Hackathon DevDay. The API adapter supplies sanitized PNG bytes and scoped candidate/evidence IDs. No live agent implementation has been verified in the checked repository.
- No vetted reference images or physical cat descriptions are in the original seed. Identity must remain unresolved unless the agent has grounded fictional evidence; no unsubstantiated match claims.

## API PR verification on macOS

An isolated checkout of PR #1 ran `npm ci`, `npm ci --prefix src/api`, `npm run typecheck` and `npm test` on Node 26.13.0. All 47 tests passed, including the symlink test that failed for lack of Windows privileges. These are local synthetic tests and do not prove production authentication, live OpenAI inference, deployment persistence or physical-phone access.

The PR pinned Sharp 0.34.5. `npm audit --prefix src/api --omit=dev` reported high-severity advisories for inherited image-decoding dependencies. GitHub's advisory identifies Sharp versions below 0.35.5 as affected by a librsvg issue under certain Linux conditions: https://github.com/advisories/GHSA-wq5f-xc86-pv6w. Another advisory covers earlier libheif issues: https://github.com/advisories/GHSA-rgj7-g3m4-5g8c. Upload signature checks may reduce relevant exposure; they do not establish that the dependency alert is safe to ignore.

I evaluated upgrading instead of relying on format restrictions. In an isolated checkout, Sharp 0.35.5 cleared the API production-dependency audit. One existing base64 PNG fixture failed the newer decoder with a libpng read error; replacing that fixture with a valid synthetic PNG preserved strict image validation. With the dependency and fixture changed, typecheck and all 47 tests passed, and the API dependency audit reported zero vulnerabilities. This is a tested candidate, not a claim that all image risks are eliminated.

The isolated fix is pushed to [codex/api-sharp-remediation](https://github.com/svertexy/mewsops/tree/codex/api-sharp-remediation), based on the PR head, commit `a33e5f4`. The API owner/coordinator can cherry-pick that commit onto PR #1 and rerun the suite. It does not modify or merge the teammate's branch.

## Research and integration sequence

1. **API owner:** review the Sharp update and valid fixture, cherry-pick the fix, run lockfile install, typecheck, API/full tests and dependency audit on the intended Node version. Review upload bounds, EXIF stripping and authorization. Keep verified session integration and public deployment separate from demo persona switching.
2. **Agent owner:** deliver the `src/agent/index.ts` `analyzeReport` implementation and evaluation results. Verify it uses the real OpenAI Agents SDK in an explicitly labeled live run, rejects invented references and unsupported matches, honors cancellation, and preserves reports/alerts when inference fails. Fixture mode must remain distinguishable.
3. **Frontend owner:** share repository/branch and design references. Verify a real mobile-first layout: touch targets, camera denial, screen readers, narrow viewports, slow/interrupted networks, retained draft and idempotency key, stale review conflicts and desktop layout. Do not infer readiness from an API test.
4. **Coordinator:** combine isolated branches and agree route shapes, candidate/evidence IDs, review selection/version, upload limits and retry semantics. Exercise phone report → saved urgent concern → image processing → agent proposal → staff review → canonical colony state. Include a loss-of-connection retry and a lookalike cat.
5. **Hosting:** select durable transactional storage and private media storage; implement verified sessions and per-resource authorization before external exposure. Local SQLite/filesystem and in-memory demo sessions are not Vercel durability or production login. Validate private access and data survival across restart/redeploy.
6. **Open backend gap:** allow a deliberate new agent attempt after an empty/uncertain result while retaining earlier attempts and evidence; the current one-receipt-per-report design rejects a different proposal. Coordinate this with the API's retry semantics before changing schema.

## Release gates

Use fictional data only. Run typecheck, focused and full tests, a separate live-model smoke test, dependency audit, security/authorization tests, real phone and desktop checks, and deployment persistence checks. Show an honest fallback when the agent cannot match a cat. No real WhatsApp scraping, no automatic cat merge/adoption/missing decisions, and no claim of production security without the missing controls.
