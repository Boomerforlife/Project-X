#!/usr/bin/env bash
# Point the custom domain at Cloud Run (managed TLS certificates, no load balancer).
#   tabbyprep.in, www.tabbyprep.in -> projectx-web      api.tabbyprep.in -> projectx-api
# Prerequisite: the domain is verified in Google Search Console by the gcloud account (gcloud domains verify <domain>).
# Prints the DNS records to add at the registrar; certificates are issued once they resolve (minutes to ~24h).
# Usage: infra/gcp/map-domain.sh [domain]
set -euo pipefail
P=projectx-staging-a7k2; R=asia-south1; D=${1:-tabbyprep.in}
map() { # host service
  if ! gcloud beta run domain-mappings describe --domain="$1" --project=$P --region=$R >/dev/null 2>&1; then
    gcloud beta run domain-mappings create --service="$2" --domain="$1" --project=$P --region=$R >/dev/null
  fi
  echo "== $1 -> $2"
  gcloud beta run domain-mappings describe --domain="$1" --project=$P --region=$R \
    --format="table[box](status.resourceRecords[].type,status.resourceRecords[].name,status.resourceRecords[].rrdata)"
}
map "$D" projectx-web
map "www.$D" projectx-web
map "api.$D" projectx-api
