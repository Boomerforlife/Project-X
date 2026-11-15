# Run this yourself in PowerShell (the value never goes into chat, git or shell history).
# Paste the Supabase "Transaction pooler" connection string, with your real DB password filled in.
# 'Continue' on purpose: gcloud prints harmless messages to stderr (e.g. NOT_FOUND on the existence check).
# Real failures are caught by Check() via the exit code.
$ErrorActionPreference = 'Continue'
$P = 'projectx-staging-a7k2'
$SA = "projectx-api@$P.iam.gserviceaccount.com"

function Check($what) { if ($LASTEXITCODE -ne 0) { throw "FAILED: $what" } }

$secure = Read-Host 'Supabase Transaction pooler URI' -AsSecureString
$plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
if ($plain -notmatch '^postgres(ql)?://') { throw 'That does not look like a postgres:// URI' }

$tmpPath = Join-Path ([IO.Path]::GetTempPath()) ("dburl-" + [Guid]::NewGuid().ToString('N') + ".txt")
try {
  [IO.File]::WriteAllText($tmpPath, $plain.Trim())
  $dataFile = "--data-file=$tmpPath"

  $existing = gcloud secrets list --project=$P --filter="name~database-url" --format="value(name)" 2>$null
  if ($existing) {
    gcloud secrets versions add database-url $dataFile --project=$P
    Check 'add secret version'
  } else {
    gcloud secrets create database-url $dataFile --replication-policy=user-managed --locations=asia-south1 --project=$P
    Check 'create secret'
  }

  gcloud secrets add-iam-policy-binding database-url --member="serviceAccount:$SA" --role=roles/secretmanager.secretAccessor --project=$P | Out-Null
  Check 'grant API access to the secret'
}
finally {
  if (Test-Path $tmpPath) { Remove-Item $tmpPath -Force }
}
Write-Host 'Done: secret database-url saved and the API account can read it.'
