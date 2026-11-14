# @projectx/contracts changelog

Contract changes are additive-only within `/api/v1`. Breaking changes require `/api/v2`.

## 0.1.0
- Initial v1 contract: enums, content blocks, answer key/response, refs, public/practice/student/admin DTOs,
  request schemas, error envelope, pagination, ingestion (`NormalizedQuestion`, `OfficialKeyIn`, `IngestionBundle`).
- JSON Schemas emitted to `json-schema/*.json`; OpenAPI to `openapi/openapi.json`.
