# MewsOps HTTP contract v1

Use opaque IDs, UTC timestamps, same-origin requests and a session cookie. JSON responses use `{"data":...}`. Errors use `{"error":{"code":"VALIDATION","message":"Malformed request","requestId":"..."}}`. Responses include X-Request-Id and Cache-Control: no-store. Only a successful private media download returns binary data.

| Method and path                | Input and response                                                                                                                                                |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET /api/health                | Public. Returns ok and analysis mode: synthetic_fixture, adapter or unavailable.                                                                                  |
| POST /api/demo/session         | Loopback synthetic mode only. JSON persona staff or volunteer. Sets a one-hour HttpOnly SameSite=Strict cookie and returns the stored actor.                      |
| POST /api/media                | Raw image/jpeg or image/png, at most 5 MiB, 16 million pixels, 8192 per side. Returns 201 with id and contentType. Send one image per request.                    |
| GET /api/media/:id             | Private PNG. Staff or uploader; volunteer must retain assignment and access to the attached report.                                                               |
| POST /api/reports              | ReportInput, returns 201 with the persisted report, observations, alerts and visible reviews. Repeat the same clientRequestId and payload to recover the receipt. |
| GET /api/reports               | Staff list of reports, newest first. Includes id, text, colonyId, receivedAt and status.                                                                          |
| GET /api/reports/:id           | Staff or assigned author. Poll this URL after processing.                                                                                                         |
| POST /api/reports/:id/process  | Staff, empty body. Invokes configured analysis and returns report detail; retry after 503. A concurrent attempt can return 409.                                   |
| GET /api/colonies              | Colonies visible to the actor.                                                                                                                                    |
| GET /api/colonies/:id          | Scoped colony details, census, pending observations, last confirmed feeding.                                                                                      |
| GET /api/cats/:id              | Scoped canonical/alias and lifecycle information. Staff detail includes observations.                                                                             |
| GET /api/reviews               | Staff only. Returns frozen proposed changes with evidence IDs and versions.                                                                                       |
| POST /api/reviews/:id/decision | Staff only. DecisionInput. Returns reviewId, status, version and optional catId.                                                                                  |
| GET /api/alerts                | Open alerts. Volunteers see only their reports in currently assigned colonies.                                                                                    |
| GET /api/summary               | Staff aggregate census, fixed, TNR needed/unknown, vet review and pending counts.                                                                                 |

## Synthetic frontend examples

Start a volunteer session with `{"persona":"volunteer"}`. Submit this JSON to /api/reports:

```json
{
  "clientRequestId": "demo-phone-1",
  "selectedColonyId": "colony-1",
  "text": "Cat limping beside the fictional gate.",
  "mediaIds": []
}
```

For photos, upload first and include the returned IDs. Optional report fields are demoLocationId and observedAt. The original report text and immediate unverified alert survive processing failures. Switch to the staff persona in a separate browser profile, list reports, then POST the process command for the returned ID. The default fixture leaves cat identity unresolved. When the agent supplies a candidate and the backend creates a review, a staff decision looks like:

```json
{
  "decision": "approve",
  "expectedVersion": 1,
  "reason": "Compared both synthetic observations",
  "selectedCatId": "cat-1"
}
```

selectedCatId is the existing backend's optional extension for choosing among frozen candidates. On 409 refresh the review before acting. Other statuses: 400 malformed input, 401 missing/expired session, 403 insufficient scope, 404 missing resource, 503 unavailable media/analyzer or rejected agent output. Report submission and processing are separate commands. While the first analysis runs, polling can continue to show received; on failure poll the saved report for failed status. Staff can inspect the original report and alert even when no proposal exists.
