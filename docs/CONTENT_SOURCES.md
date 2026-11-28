# Content sources and the question import tools

This is the policy for where questions may come from, and the how-to for the `pxw content` tools
(`workers/src/pxw/content/`). The rule behind all of it: **no question enters the bank without a recorded licence, and
nothing imported is ever published automatically.**

## 1. Allowed source kinds

A source is a row in `sources` (`supabase/migrations/0004_provenance.sql`). Its `kind` decides what the content is
labelled as (`question_origin`, copied from `app_private.promote_source_question` in 0007):

| `source_kind` | Meaning | Becomes `origin` | Typical licence evidence |
|---|---|---|---|
| `EDITORIAL_TEAM` | Questions written by our own team | `EDITORIAL` | Authorship statement / contributor agreement assigning or licensing the work |
| `LICENSED_PUBLISHER` | A publisher or author who gave us written permission | `PYQ` | Signed licence or permission email covering reuse and display on our site |
| `OFFICIAL_EXAM_BODY` | NTA / JAB and similar | `PYQ` | Written permission or legal sign-off (see section 3) |
| `AI_GENERATION` | Questions produced by our own AI pipeline | `AI_GENERATED` | Provider terms for generated output; always labelled AI-generated (section 4) |

Open licences (for example CC BY 4.0, public-domain dedications) are recorded under the kind of whoever published
them. Check that the licence allows commercial use and adaptation, and keep the attribution text in
`sources.attribution_text`.

Note: `LICENSED_PUBLISHER` maps to `origin = PYQ`, which the schema reads as "previous-year question". Only use that
kind for real previous-year material; use `EDITORIAL_TEAM` for original work.

## 2. Approval: who, where, what evidence

A source is usable only when `reuse_permitted = true` **and** `approved_at` is set (the table constraint
`sources_approval_requires_reuse` forbids approval without reuse). Both the document ingestion path and this importer
refuse a source that is not approved.

* **Who:** an ADMIN user. The admin API routes for sources require the ADMIN role (`apps/api/src/routes/admin`).
* **Register:** `POST /admin/sources` creates the source *unapproved* (`reuse_permitted = false`).
* **Approve:** `POST /admin/sources/{id}/approve` with `reuse_permitted: true`, `license_name`, optional
  `license_url`, and a `note` of at least 10 characters. The approver is stored in `approved_by`, the time in
  `approved_at`, and the action is written to `audit_log`.
* **Evidence required before approving:** a written record that we may reuse the content: the licence text and URL, or
  the signed permission / email, or the contributor agreement. Put its location in `note` and `license_url`. If you
  cannot point to evidence, do not approve.
* The seed (`supabase/seed/0005_sources.sql`) ships `PROJECTX_EDITORIAL` and `PROJECTX_AI` as approved (our own
  content) and `NTA` as **not** approved. Re-running the seed never revokes or grants an approval. Approvals made later are recorded in the live database (see section 3).

## 3. Official papers (NTA, JEE Advanced)

NTA and the JEE Advanced board (JAB) papers need written permission or a legal sign-off before use.
Being publicly downloadable is not a licence.

**Owner decision, 2026-11-20:** the owner chose to publish NTA and JAB previous-year questions without a written
permission or legal opinion, accepting that risk. Mitigations: every question shows its paper; the Terms
("Previous-year questions and official answer keys") credit NTA / JAB, disclaim ownership and affiliation, and give a
rights-holder contact for credit or removal requests, which are to be acted on promptly (unpublish with
`POST /admin/questions/{id}/unpublish`).

Current state (2026-11-19):

* `NTA_MIRROR` (NTA's own CBT papers via a mirror) was **approved by the owner on 2026-11-18**, under the rules in section 3.1. The `NTA` source is used for the JEE Main 2026 April papers.
* A source that is not approved is refused by the importer and by the document ingestion (exit code 3);
* the `scraper` branch's discovery catalogue (`workers/scraper/`, `pxw ingest discover`) only indexes the public
  URLs and metadata of official PDFs and never downloads or extracts them. Nothing found there is ingested, extracted
  or published unless the source has been approved first;
* official answer keys are linked to questions: NTA final keys (`keys nta-final`) and the answers JAB prints in its booklets. Counts are in `docs/DEPLOYMENT_GCP.md` ("Question bank").

### 3.1 NTA mirror rules (owner-approved 2026-11-18)

* Only NTA's own documents qualify: an NTA "Question Paper Name" header, or the NEET booklet cover. A paper's identity comes from NTA's paper name, never from the file name.
* The mirror's watermark (large or corner images repeated on most pages, and its name in the text) is removed before cropping.
* The mirror's own re-typed papers are excluded.
* English only. A bilingual paper keeps the version whose stem reads as English (checked by OCR); unconfirmed ones are held.
* NEET booklets (`neet_booklet`) follow the same rules. NEET 2020 and 2021 are loaded; NEET 2022 and 2024 have only re-typed copies, so they are not loaded.
* Some sets are held back (a blank copy, incomplete files, or an NTA name with no date or shift). The list is in `docs/DEPLOYMENT_GCP.md`.

## 4. What must never be imported

* Anything from coaching-institute sites, learning apps, books, solution manuals, or scraped or shared question banks
  (copyrighted; their terms forbid reuse). That includes "just reformatting" such content.
* Questions copied from memory of a paid course, or "inspired by" a specific copyrighted item with the same numbers and
  wording.
* Rows without `source` or `licence`. The importer rejects them; it never fills a default.

**AI-generated content:** import it only under an `AI_GENERATION` source. It is stored with `origin = AI_GENERATED`,
its solution (if any) with `provenance = AI_GENERATED`, and its answer is **not** stored as `answer_key` (the schema has
no honest `answer_key_source` for a single AI's answer: `AI_CONSENSUS` would claim agreement that did not happen). The
answer is kept in the provenance record and in the solution; a reviewer must set the key. It is never labelled
official or human-verified until a human approves it.

## 5. File format

CSV (header row, UTF-8), JSON (array of objects) or JSONL (one object per line). `workers/content/examples/` has
a CSV and a JSONL sample. The sample rows are fake and their stems start with `[EXAMPLE]`; the importer refuses
`[EXAMPLE]` rows unless `--allow-examples` is passed (tests only).

| Field | Required | Notes |
|---|---|---|
| `source` | yes | Source code in `sources`, for example `PROJECTX_EDITORIAL`. Must exist and be approved |
| `licence` | yes | Licence name or permission reference, for example `Owned: written by editorial team` or `CC BY 4.0`. Placeholders such as `N/A` or `unknown` are rejected (`license` is accepted as a spelling) |
| `source_ref` | yes | URL or citation of where the question came from |
| `exam` | yes | Exam slug or code: `jee-main`, `JEE_MAIN`, ... |
| `subject` | yes | Subject code, segment or slug: `PHYSICS`, `physics`, `jee-main-physics` |
| `chapter` | yes | Chapter slug or segment: `kinematics` or `jee-main-physics-kinematics`; must belong to the subject |
| `type` | yes | `SINGLE_MCQ`, `MULTI_MCQ` or `NUMERICAL` (case-insensitive) |
| `stem` | yes | Question text. Inline math `$...$` or `\(...\)`; display math `$$...$$` or `\[...\]`; `\$` for a literal dollar sign |
| `answer` | yes | MCQ: `A`, or `A,C` for `MULTI_MCQ`. NUMERICAL: a plain decimal (`4`, `-2.5`), a range `3.9..4.1`, several ranges separated by `;` (max 5). No exponents or `+` signs (the contract allows plain decimals up to 20 characters) |
| `option_a`..`option_d` (CSV) or `options` (JSON array) | MCQ: yes | Exactly 4 non-empty, distinct options. NUMERICAL must have none |
| `topic` | no | Topic slug or segment within the chapter |
| `difficulty` | no, but needed to publish | `EASY`, `MEDIUM`, `HARD` |
| `year` | no | 1978 to 2100 |
| `paper` | no | `exam_papers.slug`. Checked against the DB; year and exam must agree |
| `question_number` | no | Number within the paper |
| `external_id` | no | Your own id; kept in the provenance record |
| `solution` | no | Worked solution text (same math syntax). Stored as a pending, human-authored solution version |
| `notes` | no | Free text for reviewers; kept in the provenance record |

Marks and negative marks are not imported; rows get the column defaults (4 and 1). A reviewer sets them per question
(`PATCH /admin/questions/{id}`) where the exam scheme differs (for example numerical questions).

## 6. Commands

Run from `workers/` (`DATABASE_URL` for anything touching the DB).

```bash
# Offline check: required fields, options, answers, LaTeX structure, taxonomy (parsed from supabase/seed/*.sql),
# duplicates inside the file. Reports "not checked (offline)" for source approval, papers and DB duplicates.
pxw content validate FILE

# Same, plus the real checks against the DB: source exists and is approved, taxonomy ids, papers, and duplicates
# against questions.content_hash and source_questions.content_hash.
pxw content validate FILE --db

# Import valid rows as DRAFTs in ONE transaction. --dry-run runs everything and rolls back.
pxw content import FILE --dry-run
pxw content import FILE
#   --skip-invalid     import the valid rows even if others are invalid (default: an invalid row refuses the batch)

# Coverage: counts by exam x year x subject x chapter x publication_status, how many published questions have a
# current solution, and chapters with no published questions. Markdown by default.
pxw content coverage [--json] [--out PATH]
pxw content coverage --file FILE      # offline: what an import file would add
```

Exit codes: `0` ok, `1` invalid rows or a refused batch, `2` usage/config (for example missing `DATABASE_URL`), `3`
a source in the file is not approved (nothing is written).

Rows are numbered by data row (the CSV header is not counted; JSONL counts non-blank lines).

Idempotency: a row whose normalised text (`pxw.normalize.text`, the same `content_hash` the PDF pipeline uses) already
exists in `questions` or `source_questions`, or repeats earlier in the file, is skipped and reported as a duplicate.
Re-running the same file imports nothing the second time.

## 7. What DRAFT means, and how review and publishing work

An imported question is written as:

* `publication_status = DRAFT` (not visible to students or crawlers), `ingestion_status = IMPORTED`;
* `verification_status = HUMAN_REVIEW_REQUIRED`, which is true: it has had no check. (`PENDING` cannot be approved by
  the admin API, so this value lets it enter review);
* `origin` from the source kind, `source_id` set, `content_hash` and `dedupe_text` set;
* `structured_content` as ContentBlocks (paragraph and math blocks), options with the same blocks, and `answer_key` in
  the contract's AnswerKey shape with `answer_key_source = HUMAN`. Because the key is `HUMAN`, official answer keys
  linked later will not overwrite it;
* if `solution` was given: a `solution_versions` row with `review_status = PENDING`, not set as `current_solution_id`;
* one `audit_log` row (`action = content.import`, `actor_type = WORKER`) holding `source_ref`, `licence`,
  `external_id`, `notes`, file name, row number and batch id. The `questions` table has no column for these, so
  `audit_log` is the only place they are stored.

The importer never sets `PUBLISHED`, never sets `current_solution_id`, and never approves anything.

Review and publish go through the admin API (`apps/api/src/routes/admin`):

1. Find drafts: `GET /admin/questions` (filter by status) or the verification queue
   `GET /admin/verification/queue`.
2. Fix content if needed: `PATCH /admin/questions/{id}` (text, options, answer key, marks, difficulty).
3. Add or improve a solution: `POST /admin/questions/{id}/solutions`. An imported solution is already a pending version
   to start from.
4. Optional automated checks: `POST /admin/questions/{id}/verification/run`.
5. Approve (ADMIN or REVIEWER): `POST /admin/questions/{id}/approve` with the solution version id. This sets the
   current solution and `HUMAN_VERIFIED`.
6. Publish (ADMIN only): `POST /admin/questions/{id}/publish`. The database publish guard
   (`questions_publication_guard`, migrations 0013, 0014 and 0027) refuses with `PUBLISH_REQUIREMENTS_NOT_MET` unless the
   question is `OFFICIAL_KEY_MATCHED` or `HUMAN_VERIFIED`, has an approved current solution whose final answer equals
   the answer key, has subject and chapter and, except for official-key PYQs (0027), a difficulty, and its options match its type.
7. Undo: `POST /admin/questions/{id}/unpublish`, `/archive`, or `/dispute` (which auto-unpublishes).

Rows without `difficulty` or `solution` import fine but cannot be published until a reviewer adds them (the validator
warns about both).

### 7.1 Official-key previous-year questions without AI (2026-11-20)

The owner chose not to use Gemini / AI tagging. Previous-year questions that have an OFFICIAL answer key are published by
the Cloud Run Job `pyq-official` (`apps/api/src/jobs/pyq-official.ts`, same image and secrets as the API):

1. **Chapter** (`PYQ_STEP=tag`): a deterministic keyword classifier (`apps/api/src/content/chapter-keywords.ts`) scores
   each JEE Main chapter of the question's known subject from its OCR text and assigns one only when it clearly wins.
   Measured on the 433 already-tagged questions: 100 % precision at 60 % coverage; on the real drafts it tagged 1,523 of
   3,708 (41 %); a hand check of ~150 samples put real-draft precision at roughly 93–95 %. Each assignment writes
   `audit_log` (`question.auto_tag_chapter`, matched terms and scores), so a batch can be reviewed or undone:
   `select entity_id, details from audit_log where action='question.auto_tag_chapter'`.
   The other drafts keep `chapter_id = null` for a person (`/admin/questions/`).
2. **Publish** (`PYQ_STEP=publish`): `publishOfficialAnswerOnly` creates a solution version with provenance `OFFICIAL`,
   `final_answer` = the official key and no steps; approves it with no reviewer; sets `OFFICIAL_KEY_MATCHED` (true: the
   answer *is* the official key); copies the question and option images to the public bucket; publishes through the
   same requirement check and DB guard as the admin publish; writes `audit_log` (`question.publish_official_answer_only`).
   Only `verification_status = PENDING` drafts qualify, so dropped / multi-answer keys (held in
   `HUMAN_REVIEW_REQUIRED`) are never published.
3. **Difficulty** is an AI estimate, labelled "Estimated" (2026-11-28). The `rate-difficulty` job also rates it from attempts (`difficulty_source = 'STATS'`, first attempt per student, smoothed toward the chapter average, rated after 20 students: ≥ 70 % Easy, 40–70 % Medium, < 40 % Hard, with hysteresis).
4. PYQs do not join problem families (migration 0027): their OCR text makes poor library titles. They appear in chapter
   pages, chapter / subject practice, mistakes, bookmarks and their own public question pages (NOINDEX for now).

Run it (PowerShell: quote the comma list or gcloud receives one mangled variable):
```
gcloud run jobs update pyq-official --region asia-south1 --update-env-vars 'PYQ_DRY_RUN=true,PYQ_STEP=both,PYQ_LIMIT=5000'
gcloud run jobs execute pyq-official --region asia-south1 --wait
```
Undo one question: `POST /admin/questions/{id}/unpublish` (or `/archive`). Fix a wrong chapter: `PATCH /admin/questions/{id}`.

## 8. Constraints found in the schema

* `questions` has no provenance columns, so `source_ref`, `licence`, `external_id` and `notes` live in `audit_log`.
* `questions_answer_key_source_pair` requires key and key source to be set together, and `answer_key_source` has no
  value for an unverified AI answer; hence AI-generated answers are not stored as a key (section 4).
* The answer key refers to option UUIDs, so the importer generates the option ids itself and inserts the options with
  those ids.
* `LICENSED_PUBLISHER` and `OFFICIAL_EXAM_BODY` both become `origin = PYQ` (0007), and `PYQ` requires a source.
* The DB publish guard needs `difficulty`, so it is optional for import but required for publication.
