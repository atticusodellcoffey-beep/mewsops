# Backend handoff to agent/API and UI teammates

## Scope

This increment implements the local database and domain services. It does not provide an HTTP server, authentication provider, actual image uploads, live model inference, or a deployed Vercel database. The CLI walkthrough uses a clearly labeled synthetic proposal fixture.

Use `src/db/index.ts` to open/migrate the database and `src/domain/index.ts` to create the services. Keep raw repository access inside trusted backend code. Route application operations through services so authorization and review gates execute.

## Message to send teammates

> The backend is being integrated in `svertexy/mewsops`. Please send your branch/PR and confirm these specific integration details:
>
> **API owner:** What HTTP framework and session mechanism are you using? Construct `Actor` from the verified server session and stored assignments, never request JSON. Please map `DomainError.status/code` into the agreed error envelope. Confirm route names, upload media IDs, sanitized storage handling, and how you will invoke `applyAgentProposal` and display failures. Do not expose repositories as public write endpoints.
>
> **Agent owner:** Please provide your `analyzeReport` signature, evidence-ID convention, and validated proposal example. This backend uses the report ID and attached media IDs as evidence references. Return uncertainty and candidate explanations, and preserve an urgent reported concern when processing fails. Never call approval, merge, or lifecycle mutation services autonomously. Confirm whether uploaded images are ready for an actual live multimodal test.
>
> **UI owner:** Please provide your framework, branch/PR and reference designs. The first demo story is fictional injury report → immediate unverified alert → staff confirms cat identity. Show confirmed counts separately from pending observations; unknown TNR separately from not-fixed; actual feeding separately from report time. Staff approval submits the exact review version. Handle 409 by refreshing the review, not silently retrying approval.
>
> **Team deployment decision:** Have you already selected durable database and private image storage for Vercel? If yes, send provider names and schema/adapter constraints; no secrets in chat or GitHub. If not, we should choose that together before connecting the live deployment. The SQLite implementation is a working local backend, not a Vercel durability solution.

## Environment handling

The backend slice and deterministic walkthrough do not require an OpenAI key. The agent/API owner should load the real key only on the server. Use repository configuration templates without values; never commit credentials, local databases, or uploaded media.

## Development agreement

User approved fictional English fixtures, assigned-colony permissions selected by the coordinator, injury-first demo, and integration into main after checks pass. Each owner tests their own slice; the coordinator checks the combined workflow.
