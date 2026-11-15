# ProjectX — Ingestion Pipeline (binding; Python project `workers/`, owner W4)

Scope: approved sources only (`sources.reuse_permitted and approved_at is not null`, enforced in DB trigger and again in the CLI).
No crawling/scraping. Originals preserved byte-for-byte in R2 `SOURCE_DOCS`. Output = `source_questions` (staging) + private crops;
promotion creates DRAFT `questions` and enqueues `AI_CLASSIFY`. Never run inside API requests.

## 1. Project layout (Python 3.13)
```
workers/
  pyproject.toml            name "pxw"; deps below; [project.scripts] pxw = "pxw.cli:main"; extras: paddle, tesseract, dev
  src/pxw/
    cli.py                  argparse entry (subcommands §5)
    config.py               env → Settings (pydantic)
    common/{logging.py, hashing.py, jsonio.py, models.py}   # models.py = Pydantic mirrors of contracts (§3)
    storage/{base.py, local.py, r2.py}                       # ObjectStore protocol; local FS + boto3 S3 (R2)
    jobs/{base.py, file_store.py, pg_store.py, runner.py}    # JobStore protocol; idempotent runner
    db/{repo.py, pg_repo.py, file_repo.py}                   # IngestionRepo protocol (writes source docs/questions/keys/assets)
    extraction/{pdf.py, layout_profiles/{nta_cbt_v1.py, generic_numbered.py}, segment.py, figures.py, math_text.py}
    ocr/{base.py, rapid.py, paddle.py, tesseract.py, mock.py, chain.py}
    normalize/{normalize.py, text.py}
    dedupe/{dedupe.py}
    answer_keys/{parse.py}
    pipeline/{process_document.py, parse_answer_key.py, stages.py}
    verification/            # OWNED BY W3 (sympy_check.py) — W4 must not edit
  tests/  (fixtures generated programmatically; no real PYQs committed)
    verification/            # OWNED BY W3
```
Dependencies (pyproject, W4 writes once): `pymupdf>=1.26,<3`, `pydantic>=2.11,<3`, `psycopg[binary]>=3.2,<4`, `boto3>=1.40,<2`,
`rapidfuzz>=3.13,<4`, `rapidocr>=3.4,<4`, `onnxruntime>=1.22`, `sympy==1.14.0`, `numpy>=2`, `pillow>=11`; extras `paddle = ["paddleocr>=3.2","paddlepaddle>=3.1"]`,
`tesseract = ["pytesseract>=0.3.13"]`, `dev = ["pytest>=8.4","ruff>=0.12"]`. Venv at `workers/.venv` (gitignored).

## 2. Interfaces (Python `Protocol`s; exact names)
```python
class ObjectStore(Protocol):
    def put(self, bucket: BucketName, key: str, data: bytes, content_type: str) -> None: ...
    def get(self, bucket: BucketName, key: str) -> bytes: ...
    def exists(self, bucket: BucketName, key: str) -> bool: ...
# BucketName = Literal["SOURCE_DOCS","PUBLIC_ASSETS","USER_UPLOADS"]; LocalObjectStore(root=LOCAL_STORAGE_DIR) maps to root/<bucket>/<key> plus
# sidecar root/<bucket>/<key>.meta.json = {"contentType": "..."} (identical to TS createLocalStorage → API dev server can stream them);
# R2ObjectStore(account_id, key_id, secret, bucket_names) via boto3 S3 endpoint https://<account_id>.r2.cloudflarestorage.com.
# Key builders in pxw/storage/keys.py must equal @projectx/edge r2Keys (sources/{code}/{year}/{sha}.{ext}, derived/{docId}/crops/q{num}-{n}.png, ...).

class OcrEngine(Protocol):
    name: str
    def available(self) -> bool: ...
    def recognize(self, png: bytes, *, lang: str = "en") -> OcrResult: ...
@dataclass class OcrLine: text: str; bbox: tuple[float,float,float,float]; confidence: float
@dataclass class OcrResult: engine: str; lines: list[OcrLine]; mean_confidence: float
# chain.py: OcrChain(engines from OCR_ENGINES order, min_confidence=OCR_MIN_CONFIDENCE): first available engine; if mean_confidence <
# min → try next; best result kept; none available → OcrResult(engine="none", lines=[], mean_confidence=0) + warning "OCR_UNAVAILABLE".
# MockOcrEngine(fixtures: dict[sha256(png), OcrResult]) for tests. Paddle/Tesseract imports are lazy (optional extras).

class JobStore(Protocol):
    def enqueue(self, kind: JobKind, idempotency_key: str, payload: dict, *, source_document_id: str | None = None, priority: int = 100) -> str: ...
    def claim(self, worker_id: str, kinds: list[JobKind], lease_seconds: int = 600) -> Job | None: ...
    def heartbeat(self, job_id: str, worker_id: str, lease_seconds: int = 600) -> bool: ...
    def complete(self, job_id: str, worker_id: str, result: dict) -> bool: ...
    def fail(self, job_id: str, worker_id: str, error: str, retryable: bool = True) -> JobStatus: ...
    def log(self, job_id: str, level: str, stage: str | None, message: str, data: dict | None = None) -> None: ...
# PgJobStore calls app_private.{enqueue,claim,heartbeat,complete,fail}_pipeline_job / log_pipeline_job_event (DATABASE_SCHEMA §0007).
# FileJobStore (JSON file + file lock under PXW_WORK_DIR/jobs.json) reproduces identical semantics (lease, backoff, DEAD) for offline tests.

class IngestionRepo(Protocol):
    def get_source(self, code: str) -> Source: ...                       # raises SourceNotApproved unless reuse_permitted & approved_at
    def upsert_paper(self, paper: PaperIn) -> str: ...                   # by slug
    def register_document(self, doc: SourceDocumentIn) -> tuple[str, bool]: ...   # by sha256 → (id, created)
    def upsert_source_question(self, sq: SourceQuestionIn) -> str: ...  # by (source_document_id, question_number)
    def insert_asset(self, a: AssetIn) -> str: ...                       # question_assets with source_question_id; by (bucket, r2_key)
    def exact_duplicates(self, content_hash: str) -> list[str]: ...      # questions.content_hash ∪ promoted source_questions
    def near_duplicates(self, normalized_text: str, threshold: float) -> list[tuple[str, float]]: ...  # app_private.find_near_duplicates
    def upsert_official_keys(self, rows: list[OfficialKeyIn]) -> int: ...
    def promote(self, source_question_id: str, exam_id: str, subject_code: str | None) -> str: ...   # app_private.promote_source_question
    def link_keys(self, paper_id: str) -> int: ...                       # app_private.link_official_answer_keys
# PgIngestionRepo (psycopg 3, DATABASE_URL, one txn per call) and FileIngestionRepo (JSON under PXW_WORK_DIR/db/, for tests; near-dup via rapidfuzz).
```

## 3. Data contracts (JSON Schema emitted by `@projectx/contracts` to `packages/contracts/json-schema/normalized-question.json`; Pydantic mirror in `pxw/common/models.py`)
```jsonc
NormalizedQuestion = {
  "schema_version": 1,
  "question_number": "12",                       // as printed, required
  "external_question_id": "4054551234" | null,   // NTA Question ID if present
  "section_hint": "PHYSICS" | "CHEMISTRY" | "MATHEMATICS" | null,
  "question_type_guess": "SINGLE_MCQ" | "MULTI_MCQ" | "NUMERICAL" | null,
  "content": ContentBlock[],                     // images as {"type":"image","asset_ref":"q12-fig1","alt":""} (asset_ref, not asset_id)
  "options": [{ "label": "A", "external_option_id": "4054551235" | null, "content": ContentBlock[] }],   // [] for NUMERICAL
  "assets": [{ "asset_ref": "q12-fig1", "asset_id": uuid | null, "kind": "DIAGRAM", "page": 3,
               "bbox": [x0,y0,x1,y1], "sha256": "…", "mime_type": "image/png", "width": 640, "height": 320, "r2_key": "derived/…png" }],
  "page_start": 3, "page_end": 3,
  "question_text": "plain text with inline $LaTeX$",   // → questions.question_text on promotion
  "normalized_text": "…",                              // dedupe form (§6)
  "content_hash": "sha256 hex",
  "extraction": { "method": "TEXT"|"OCR"|"MIXED", "ocr_engine": "rapidocr"|null, "mean_confidence": 0.93|null,
                  "warnings": ["NEEDS_MATH_REVIEW","OPTION_COUNT_UNUSUAL","OCR_LOW_CONFIDENCE","FIGURE_NOT_CAPTURED", …] }
}
```
On promotion, `promote_source_question` replaces each `asset_ref` block with `{"type":"image","asset_id": assets[i].asset_id, "alt": …}` and sets
`question_assets.question_id`. Warnings enumerated in `pxw/common/models.py::Warning` (StrEnum) — any warning blocks auto-promotion.

`OfficialKeyIn = { paper_id, source_document_id, question_number|null, external_question_id|null, raw_answer, normalized_answer: OfficialAnswer, is_dropped }`
(OfficialAnswer per DATABASE_SCHEMA §2).

## 4. Job design & idempotency
* Jobs: `PROCESS_DOCUMENT` (payload `{source_document_id, layout_profile, exam_id, auto_promote: bool}`, key `PROCESS_DOCUMENT:{source_document_id}:{PIPELINE_VERSION}`),
  `PARSE_ANSWER_KEY` (payload `{source_document_id, paper_id}`, key `PARSE_ANSWER_KEY:{source_document_id}:{PIPELINE_VERSION}`). `PIPELINE_VERSION = "v1"`.
* Stages of PROCESS_DOCUMENT (each a pure-ish function with `STAGE_VERSION`; artifact `{PXW_WORK_DIR}/{doc_sha256}/{stage}.v{N}.json`, written atomically
  (tmp + rename) with its own sha256; present & valid → stage skipped on retry):
  1 `fetch` (download original from SOURCE_DOCS, verify sha256) → 2 `extract` (PyMuPDF `page.get_text("dict")` spans with bbox/font; text coverage per page)
  → 3 `ocr` (pages with < 50 chars text or > 30 % non-ASCII garbage: render 200 dpi PNG → OcrChain) → 4 `segment` (layout profile regexes split questions/options;
  NTA CBT profile: `Q\.?\s*(\d+)`, `Question ID\s*:\s*(\d+)`, `Option\s*(\d)\s*ID\s*:\s*(\d+)`, option markers `(1)…(4)`/`(A)…(D)`; numerical when no options/
  "Given Answer"/SA section) → 5 `figures` (images/drawings intersecting question bbox → render clip PNG 200 dpi → `derived/{source_document_id}/crops/q{num}-{n}.png`)
  → 6 `normalize` (§6, math_text: unicode → LaTeX for √ ² ³ ∫ Σ π θ ≤ ≥ → etc.; unknown glyphs → warning NEEDS_MATH_REVIEW) → 7 `dedupe` → 8 `persist`
  (upsert source_questions + assets; status NORMALIZED or DUPLICATE) → 9 `promote` (only if `auto_promote` and no warnings and not duplicate/possible-duplicate).
* Heartbeat after each stage; `fail(retryable=False)` for SourceNotApproved, checksum mismatch, unsupported layout; retryable for IO/DB errors.
* Every stage logs `{stage, duration_ms, counts}` via `JobStore.log`. Re-running the same job never duplicates rows (natural keys above) or objects (deterministic keys).

## 5. CLI (`python -m pxw` or `pxw`; global flags `--job-store file|postgres`, `--storage local|r2`, `--work-dir`, `--log-level`)
```
pxw ingest register --source NTA --file paper.pdf --kind QUESTION_PAPER|ANSWER_KEY --paper-slug jee-main-2024-jan-27-shift-1
                    --paper-title "…" --year 2024 [--exam-date 2024-01-27 --shift 1 --session January --paper-code …]
                    [--layout nta_cbt_v1] [--auto-promote] [--exam jee-main]
      → checks source approval, uploads original to SOURCE_DOCS `sources/{source_code}/{year}/{sha256}.pdf`, upserts paper + document,
        enqueues PROCESS_DOCUMENT or PARSE_ANSWER_KEY. Prints JSON {document_id, job_id, created}.
pxw jobs run [--kinds PROCESS_DOCUMENT,PARSE_ANSWER_KEY] [--max-jobs 10] [--worker-id pxw-<host>] [--once]
pxw process-document --file x.pdf --out DIR [--layout …] [--ocr-engines mock]   # offline: no DB/storage, writes NormalizedQuestion[] bundle + crops
pxw parse-answer-key --file key.pdf --out DIR                                   # offline: writes OfficialKeyIn[]
pxw ocr --image x.png [--engines rapidocr,paddle]                               # prints OcrResult JSON
pxw promote --document-id <uuid> --exam jee-main                                # promote all clean NORMALIZED source_questions
python -m pxw.verification.sympy_check                                          # (W3) stdin/stdout JSON
```
Exit codes: 0 ok, 2 usage/config, 3 source not approved, 4 job failed permanently, 1 other. Output to stdout is JSON lines.

## 6. Normalisation & dedupe
* `normalized_text` = NFKC → lowercase → LaTeX commands kept as tokens (`\frac`) → remove whitespace runs → strip punctuation except `+-*/=^()[]{}<>.,` →
  question text + `" || "` + options' normalized text joined `" | "` in label order.
* `content_hash = sha256(normalized_text)`. Exact duplicate (repo.exact_duplicates non-empty) → status DUPLICATE, `duplicate_of_question_id`.
* Near duplicate: in-batch `rapidfuzz.fuzz.token_set_ratio ≥ 95` and DB `find_near_duplicates(normalized_text, 0.90)` → `possible_duplicate_of`,
  `duplicate_similarity`; stays NORMALIZED but never auto-promoted (admin decides).

## 7. Answer keys
`PARSE_ANSWER_KEY`: PyMuPDF words → rows `(question_id_or_number, answer)`; answers: option ID (8–12 digits) → `EXTERNAL_OPTION_IDS`; `1..4`/`A..D` →
`OPTION_LABELS` (1→A); numeric/range (`2.5`, `2.4 to 2.6`, `2.4-2.6`) → `NUMERIC` ranges; `Drop`/`Bonus` → `DROPPED`; multiple accepted
(`1,3` / `ID1, ID2`) → multiple. Upsert official_answer_keys then `link_keys(paper_id)`. Unparseable rows → warning event, job still SUCCEEDED with
`result.unparsed_rows`.

## 8. Tests (offline; `cd workers && .venv\Scripts\python -m pytest -q`)
Fixture PDFs are **generated in tests with PyMuPDF** (synthetic text "Sample question 1 …" in NTA-CBT and numbered layouts, one page as image-only
to force OCR via MockOcrEngine, one figure drawing). Required: segmentation counts/options/IDs; numerical detection; math_text conversions; OCR
chain fallback order + low-confidence escalation + OCR_UNAVAILABLE; normalization/hash stability; exact + near dedupe; answer-key parser cases
(IDs, labels, ranges, drop, multi); FileJobStore lease/backoff/DEAD/idempotent enqueue; stage artifact resume (kill after stage 4 → rerun skips 1–4);
idempotent persist (run twice → same row counts); source-not-approved refusal. Optional (skipped unless `PXW_TEST_DATABASE_URL`): PgJobStore/
PgIngestionRepo against `npm run db:serve`.

## 11. Approved-URL fetcher (`pxw ingest fetch`)
Not a crawler. It downloads only the PDFs listed in a curated manifest (`workers/manifests/*.manifest.json`; see `example.manifest.json`).
Run: `pxw ingest fetch --manifest <file> [--dry-run] [--auto-promote] [--min-interval 5]`, then `pxw jobs run --once`.
Guards (tests: `workers/tests/test_fetcher.py`): every source in the manifest must be approved *before any network request*
(exit 3 otherwise); `allowed_hosts` per source, re-checked on every redirect hop (max 3); https only; robots.txt honoured
(a robots error means deny); 5 s per-host spacing; 60 MB cap; Content-Type must be `application/pdf` and the body must start with `%PDF`.
Downloads land in `<work-dir>/downloads/<sha256>.pdf` with a `.json` provenance sidecar (requested/final URL, time), then go
through the normal `register` path (idempotent by sha256). The database has no source-URL column yet, so the URL lives in the sidecar only.
Setting the real NTA source to approved (licence recorded by an admin) is a prerequisite for any NTA manifest.
