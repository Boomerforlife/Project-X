# PYQ scraper (discovery + gated ingestion)

`pxw ingest discover` crawls a few official exam-body index pages, finds question-paper and answer-key PDFs,
classifies them (exam, year, date, shift, paper, set, language, provisional/final key) and merges them into
`catalog.json`. It stores **public URLs and metadata only** and never downloads a paper.

| Source code        | Exam         | Where                                   |
| ------------------ | ------------ | --------------------------------------- |
| `NTA`              | jee-main     | jeemain.nta.nic.in (+ its archive pages) |
| `NTA`              | neet-ug      | neet.nta.nic.in (+ archive)              |
| `JEE_ADVANCED_JAB` | jee-advanced | jeeadv.ac.in/archive.html                |

Guards (shared with Owner B's `Fetcher`): https only, per-source host allow-list on every hop, robots.txt honoured,
5 s per-host throttle, page size cap. NTA's firewall rejects user agents containing a URL or "robots.txt", so keep
`user_agent` plain.

## Run locally
```bash
PYTHONPATH=workers/src python -m pxw.fetch.discover --sources workers/scraper/sources.json \
  --catalog workers/scraper/catalog.json --manifest-out .local/work/manifest.json
# or, with the worker installed: pxw ingest discover --manifest-out .local/work/manifest.json
```

## Online (GitHub Actions, free on this public repo)
`.github/workflows/scraper.yml` runs discovery and commits catalogue changes back to the `scraper` branch.
* Runs on every push to `scraper` that touches the scraper, and on manual dispatch.
* The **daily schedule only fires once the workflow file is on `main`** (GitHub runs schedules from the default branch).
* Optional `ingest` job: downloads newly found papers into the private source-docs bucket and queues them for
  extraction. Off unless repo variable `PXW_INGEST_ENABLED=true`, secrets `PXW_DATABASE_URL` and `GCP_SA_KEY`
  (service-account JSON with objectAdmin on the buckets), and variables `GCS_PROJECT` + the three `GCS_BUCKET_*` exist.
  Storage uses Owner B's `GcsObjectStore` (google-cloud-storage, application default credentials).

## Licensing gate (unchanged, deliberate)
`pxw ingest fetch` refuses any source whose `sources.reuse_permitted`/`approved_at` are not set in the database.
`NTA` is seeded as **not approved**, and `JEE_ADVANCED_JAB` does not exist in the database yet. Nothing official is downloaded,
extracted or published until someone records the licence decision. Imports always land as drafts for review.
Third-party question banks (coaching sites, apps, books) are not crawled: they are copyrighted and their terms forbid it.
