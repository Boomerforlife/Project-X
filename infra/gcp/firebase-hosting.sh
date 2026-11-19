#!/usr/bin/env bash
# Custom domain for the website via Firebase Hosting -> Cloud Run.
# Cloud Run's own domain mapping is not offered in asia-south1, and a global load balancer costs ~USD 18/month;
# Firebase Hosting rewrites to Cloud Run in asia-south1 are supported and free at this traffic.
# Hosting strips cookies (except __session): fine, the app keeps its session in the browser and sends Bearer tokens.
# Hosting has a 60 s request timeout and caches responses whose Cache-Control allows a shared cache.
#
# Usage:
#   infra/gcp/firebase-hosting.sh deploy              # route every path of the default site to projectx-web
#   infra/gcp/firebase-hosting.sh domain tabbyprep.in # connect a custom domain (prints the DNS records to add)
#   infra/gcp/firebase-hosting.sh status tabbyprep.in # show DNS/TLS state of a connected domain
set -euo pipefail
P=projectx-staging-a7k2; SITE=${SITE:-$P}; SERVICE=${SERVICE:-projectx-web}; REGION=asia-south1
H=https://firebasehosting.googleapis.com/v1beta1
T=$(gcloud auth print-access-token)
api() { # method path [json]
  curl -sS -m 60 -X "$1" -H "Authorization: Bearer $T" -H "x-goog-user-project: $P" -H "Content-Type: application/json" \
    "$H/$2" ${3:+-d "$3"}
}
field() { python -c "import sys,json;print(json.load(sys.stdin)$1)"; }

case "${1:-}" in
  deploy)
    v=$(api POST "sites/$SITE/versions" \
      "{\"config\":{\"rewrites\":[{\"glob\":\"**\",\"run\":{\"serviceId\":\"$SERVICE\",\"region\":\"$REGION\"}}]}}" | field "['name']")
    api PATCH "$v?update_mask=status" '{"status":"FINALIZED"}' >/dev/null
    api POST "sites/$SITE/releases?versionName=$v" '{"message":"route all paths to Cloud Run"}' | field "['name']"
    echo "live: https://$SITE.web.app";;
  domain)
    D=${2:?domain}
    api POST "projects/$P/sites/$SITE/customDomains?customDomainId=$D" '{}' >/dev/null || true
    "$0" status "$D";;
  status)
    D=${2:?domain}
    api GET "projects/$P/sites/$SITE/customDomains/$D" | python -c "
import sys,json
d=json.load(sys.stdin)
print('host:', d.get('hostState'), ' ownership:', d.get('ownershipState'), ' cert:', (d.get('cert') or {}).get('state'))
for k in ('requiredDnsUpdates',):
    u=d.get(k) or {}
    for s in u.get('desired',[]):
        for r in s.get('records',[]):
            print('ADD   ', r.get('type'), s.get('domainName'), r.get('rdata'))
    for s in u.get('discovered',[]):
        for r in s.get('records',[]):
            print('found ', r.get('type'), s.get('domainName'), r.get('rdata'))
";;
  *) sed -n 2,12p "$0"; exit 1;;
esac
