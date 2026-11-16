#!/usr/bin/env bash
# Create/update the Cloud Run Job that runs the Python ingestion workers, then optionally execute one command.
# Usage: infra/gcp/ingest-job.sh <image-tag> [pxw args...]     e.g.
#   infra/gcp/ingest-job.sh workers-1 ingest fetch --manifest workers/manifests/jee-main-2026-april.manifest.json --auto-promote
#   infra/gcp/ingest-job.sh workers-1 jobs run --once --max-jobs 20
set -euo pipefail
P=projectx-staging-a7k2; R=asia-south1; TAG=${1:?image tag}; shift || true
IMG=$R-docker.pkg.dev/$P/projectx/workers:$TAG
SA=projectx-ingest@$P.iam.gserviceaccount.com
ENV="PXW_JOB_STORE=postgres,STORAGE_DRIVER=gcs,GCS_PROJECT=$P,OCR_ENGINES=${OCR_ENGINES:-rapidocr}"
ENV="$ENV,GCS_BUCKET_SOURCE_DOCS=$P-source-docs,GCS_BUCKET_PUBLIC_ASSETS=$P-public-assets,GCS_BUCKET_USER_UPLOADS=$P-user-uploads"
common=(--project=$P --region=$R --image=$IMG --service-account=$SA --set-env-vars="$ENV"
        --set-secrets=DATABASE_URL=database-url:latest --cpu=4 --memory=4Gi --task-timeout=3600 --max-retries=0
        --tasks=${TASKS:-1} --parallelism=${TASKS:-1})
if gcloud run jobs describe pxw-ingest --project=$P --region=$R >/dev/null 2>&1; then
  gcloud run jobs update pxw-ingest "${common[@]}" >/dev/null
else
  gcloud run jobs create pxw-ingest "${common[@]}" >/dev/null
fi
if [ $# -gt 0 ]; then
  ARGS=$(IFS=,; echo "$*")
  gcloud run jobs execute pxw-ingest --project=$P --region=$R --wait --args="$ARGS"
fi
