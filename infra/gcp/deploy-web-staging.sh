#!/usr/bin/env bash
# Deploy the website (Next.js standalone) to Cloud Run (staging). Build the image first with cloudbuild.web.yaml
# (see docs/DEPLOY_WEB_CLOUD_RUN.md); NEXT_PUBLIC_* values are baked in at build time.
# Usage: infra/gcp/deploy-web-staging.sh [image-tag]
set -euo pipefail
P=projectx-staging-a7k2; R=asia-south1; TAG=${1:-web-staging-1}
IMG=$R-docker.pkg.dev/$P/projectx/web:$TAG
gcloud run deploy projectx-web --project=$P --region=$R --image=$IMG \
  --service-account=projectx-web@$P.iam.gserviceaccount.com \
  --allow-unauthenticated --min-instances=0 --max-instances=3 --cpu=1 --cpu-boost --memory=512Mi --concurrency=80 --timeout=60 \
  --set-env-vars="API_BASE_URL=${API_BASE_URL:-https://projectx-api-989800061583.asia-south1.run.app/api/v1}" \
  --set-secrets="REVALIDATE_SECRET=web-revalidate-secret:latest"
echo "Web: https://projectx-web-989800061583.asia-south1.run.app"
