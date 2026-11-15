#!/usr/bin/env bash
# Deploy the API to Cloud Run (staging). REQUIRES APPROVAL: creates/updates a billable (free-tier eligible) service.
# Usage: infra/gcp/deploy-api-staging.sh [image-tag] [cors-origins]
set -euo pipefail
P=projectx-staging-a7k2; R=asia-south1; TAG=${1:-staging-1}; CORS=${2:-http://localhost:3000}
export CLOUDSDK_API_ENDPOINT_OVERRIDES_CLOUDBUILD=https://cloudbuild.googleapis.com/
IMG=$R-docker.pkg.dev/$P/projectx/api:$TAG
SA=projectx-api@$P.iam.gserviceaccount.com
gcloud run deploy projectx-api --project=$P --region=$R --image=$IMG --service-account=$SA \
  --allow-unauthenticated --min-instances=0 --max-instances=3 --cpu=1 --memory=512Mi --concurrency=40 --timeout=60 \
  --set-env-vars="^@^APP_ENV=staging@AUTH_MODE=jwks@DB_DRIVER=postgres@STORAGE_DRIVER=gcs@SUPABASE_URL=https://gardheietftxyforposh.supabase.co@GCS_BUCKET_SOURCE_DOCS=$P-source-docs@GCS_BUCKET_PUBLIC_ASSETS=$P-public-assets@GCS_BUCKET_USER_UPLOADS=$P-user-uploads@PUBLIC_ASSETS_BASE_URL=https://storage.googleapis.com/$P-public-assets@CORS_ALLOWED_ORIGINS=$CORS" \
  --set-secrets="DATABASE_URL=database-url:latest,SIGNING_SECRET=signing-secret:latest,IP_HASH_SECRET=ip-hash-secret:latest"
URL=$(gcloud run services describe projectx-api --project=$P --region=$R --format='value(status.url)')
# FILES_BASE_URL needs the service's own URL, known only after the first deploy.
gcloud run services update projectx-api --project=$P --region=$R --update-env-vars="FILES_BASE_URL=$URL/api/v1/files" >/dev/null
echo "API: $URL  (try $URL/api/v1/health)"
