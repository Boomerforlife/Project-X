# @projectx/contracts changelog

Contract changes are additive-only within `/api/v1`. Breaking changes require `/api/v2`.

## 0.1.0
- Initial v1 contract: enums, content blocks, answer key/response, refs, public/practice/student/admin DTOs,
  request schemas, error envelope, pagination, ingestion (`NormalizedQuestion`, `OfficialKeyIn`, `IngestionBundle`).
- JSON Schemas emitted to `json-schema/*.json`; OpenAPI to `openapi/openapi.json`.

## 0.2.0 (web integration, additive)
- `SitemapEntry` += `slug`, `exam_slug` (B0).
- `Me` += `class_level` (`'11' | '12' | 'dropper' | null`), `onboarding_completed`; `PatchMeBody` += `class_level` (B1, migration 0015).
- `CreateSessionBody` += `ui_mode` (`learning` default | `test`), `time_limit_sec` (60..21600); `SessionSummary` += `ui_mode`, `time_limit_sec` (B4, migration 0015).
- `AttemptResult` += `response` (the stored `AnswerResponse`), `time_spent_ms` (B2). `PRACTICE_FORBIDDEN_KEYS` still apply to practice DTOs only.
- New `GET /practice/sessions` (`SessionListItem`, optional `status` csv, cursor pagination) (B3).
- New `POST /practice/sessions/{id}/complete` -> `SessionProgress`, idempotent; ABANDONED -> 409 (B5).
- New `GET /users/me/activity?from&to` -> `ActivityDay[]` (default last 120 days, max span 400 days) (B6).
- Types `TaxonomyTree`, `TaxonomyExam` exported.
