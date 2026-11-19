#!/usr/bin/env bash
# Deploy the API to Cloud Run (staging). Creates/updates a billable (free-tier eligible) service.
# Usage: infra/gcp/deploy-api-staging.sh [image-tag]
# Razorpay: billing turns on only when ALL THREE secrets razorpay-key-id, razorpay-key-secret, razorpay-webhook-secret
# exist in Secret Manager (create them with infra/gcp/set-razorpay-secrets.ps1). Otherwise payments stay off.
set -euo pipefail
P=projectx-staging-a7k2; R=asia-south1; TAG=${1:-staging-5}
export CLOUDSDK_API_ENDPOINT_OVERRIDES_CLOUDBUILD=https://cloudbuild.googleapis.com/
IMG=$R-docker.pkg.dev/$P/projectx/api:$TAG
SA=projectx-api@$P.iam.gserviceaccount.com
API_URL=${API_URL:-https://projectx-api-989800061583.asia-south1.run.app}
# WEB_URL = the public site (links, CORS). The revalidate webhook goes straight to Cloud Run (WEB_RUN_URL), not via the CDN.
WEB_RUN_URL=https://projectx-web-989800061583.asia-south1.run.app
WEB_URL=${WEB_URL:-https://tabbyprep.in}
EXTRA_ORIGINS=${EXTRA_ORIGINS:-https://www.tabbyprep.in,https://projectx-staging-a7k2.web.app,$WEB_RUN_URL}

SECRETS="DATABASE_URL=database-url:latest,SIGNING_SECRET=signing-secret:latest,IP_HASH_SECRET=ip-hash-secret:latest,WEB_REVALIDATE_SECRET=web-revalidate-secret:latest"
have() { gcloud secrets describe "$1" --project=$P >/dev/null 2>&1; }
if have razorpay-key-id && have razorpay-key-secret && have razorpay-webhook-secret; then
  SECRETS="$SECRETS,RAZORPAY_KEY_ID=razorpay-key-id:latest,RAZORPAY_KEY_SECRET=razorpay-key-secret:latest,RAZORPAY_WEBHOOK_SECRET=razorpay-webhook-secret:latest"
  echo "Razorpay secrets found: billing ON (test keys only unless BILLING_ALLOW_LIVE=true)"
else
  echo "Razorpay secrets not set: billing OFF (pricing page shows 'Payments are not open yet')"
fi

ENV="APP_ENV=staging@AUTH_MODE=jwks@DB_DRIVER=postgres@STORAGE_DRIVER=gcs"
ENV="$ENV@SUPABASE_URL=https://gardheietftxyforposh.supabase.co"
ENV="$ENV@GCS_BUCKET_SOURCE_DOCS=$P-source-docs@GCS_BUCKET_PUBLIC_ASSETS=$P-public-assets@GCS_BUCKET_USER_UPLOADS=$P-user-uploads"
ENV="$ENV@PUBLIC_ASSETS_BASE_URL=https://storage.googleapis.com/$P-public-assets@FILES_BASE_URL=$API_URL/api/v1/files"
ENV="$ENV@CORS_ALLOWED_ORIGINS=$WEB_URL${EXTRA_ORIGINS:+,$EXTRA_ORIGINS},http://localhost:3000"
ENV="$ENV@WEB_BASE_URL=$WEB_URL@WEB_REVALIDATE_URL=$WEB_RUN_URL/api/revalidate/"

gcloud run deploy projectx-api --project=$P --region=$R --image=$IMG --service-account=$SA \
  --allow-unauthenticated --min-instances=0 --max-instances=3 --cpu=1 --cpu-boost --memory=512Mi --concurrency=40 --timeout=60 \
  --set-env-vars="^@^$ENV" --set-secrets="$SECRETS"
echo "API: $API_URL  (try $API_URL/api/v1/health)"
