# Backend implementation decisions

This backend follows the Obsidian Mangrove Mews master plan and the newer five-person shared contract. The latter replaces the earlier separate QA/media roles and speculative confidence scores.

## Boundaries

- Development workers: database, domain services, adversarial review, and coordinator/integration. This does not add runtime AI agents.
- SQLite is the local, durable file-backed store. HTTP/session transport, live OpenAI execution, image sanitation/storage and the reference-led UI remain other lanes.
- Trusted actor context must be created by server authentication. Domain methods are not an authentication system.
- Volunteers are restricted to assigned colonies and their own reports. Exact locations and contact details are staff-only.
- Text-based urgent flags are conservative reported concerns, not diagnoses. They must survive agent failure and identity uncertainty.
- Review approval is a transaction over a frozen proposal and version. Neither a report nor an AI suggestion silently changes confirmed cat identities or sensitive lifecycle states.
- A reported feeding and a confirmed feeding visit are different records. Unknown sterilization does not imply confirmed TNR-needed.
- Synthetic image references are not proof of actual image upload or multimodal inference.

## Integration sequence

1. Database migrations and deterministic seed.
2. Real database adapter and scoped domain methods.
3. Persisted report → pending review → approved link → unchanged canonical census for a second photo of the same cat.
4. Adversarial review and regression tests.
5. Publish backend handoff and PR for the API and UI teammates.

## Deployment limitation

Local SQLite files must not be treated as durable storage inside Vercel Functions. Deployment needs a deliberate durable database/private media choice and corresponding adapter before a live persistence claim. This backend slice does not provision cloud services or implement production login.
