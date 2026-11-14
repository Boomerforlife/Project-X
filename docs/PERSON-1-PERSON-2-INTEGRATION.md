# Person 1 / Person 2 Integration Checklist

Use this document in the first frontend/backend alignment meeting.

## Agree before real API integration
- [ ] Auth/session model and user identity.
- [ ] Shared TypeScript types or OpenAPI source of truth.
- [ ] Question shape, question type enum, math/figure representation.
- [ ] Exam, subject, chapter, topic, year, paper, and shift identifiers.
- [ ] Answer submission format for MCQ, multi-select, and numerical answers.
- [ ] Learning, test, and CBT mode rules.
- [ ] Attempt lifecycle: create, save, resume, autosave, submit, retry.
- [ ] Scoring, negative marking, and section rules.
- [ ] Solution and hint response shape and availability.
- [ ] Bookmark, review-list, and mistake-notebook APIs.
- [ ] Analytics aggregation and time windows.
- [ ] Verification status vocabulary and what each status guarantees.
- [ ] Pagination, filtering, sorting, and error format.
- [ ] Authorization, rate limits, and premium entitlement enforcement.
- [ ] Stable IDs and API versioning/compatibility policy.

## Contract principles
- Frontend mocks must validate against the agreed schema.
- Frontend must not infer ingestion/verification internals.
- Backend must not dictate the frontend visual design.
- The server is authoritative for identity, permissions, scoring, and verification.
- Retrying a paper creates a new attempt; never overwrite the original.
- Autosave failures must be visible and recoverable; never silently lose responses.

## Example entities to align
`Question`, `Paper`, `Attempt`, `Response`, `Solution`, `UserProfile`, `Bookmark`, `MistakeRecord`.

These are conceptual labels only. Define actual fields and relationships together.
