# Run this yourself in PowerShell (the value never goes into chat, git or shell history).
# Paste the Supabase "Transaction pooler" connection string (Dashboard -> Connect), with [YOUR-PASSWORD] replaced by your real DB password.
$P = 'projectx-staging-a7k2'
$secure = Read-Host 'Supabase Transaction pooler URI' -AsSecureString
$plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
if ($plain -notmatch '^postgres(ql)?://') { throw 'That does not look like a postgres:// URI' }
$tmp = New-TemporaryFile
try {
  [IO.File]::WriteAllText($tmp.FullName, $plain.Trim())
  gcloud secrets describe database-url --project=$P *> $null
  if ($LASTEXITCODE -eq 0) { gcloud secrets versions add database-url --data-file=$tmp.FullName --project=$P }
  else { gcloud secrets create database-url --data-file=$tmp.FullName --replication-policy=user-managed --locations=asia-south1 --project=$P }
  gcloud secrets add-iam-policy-binding database-url --member="serviceAccount:projectx-api@$P.iam.gserviceaccount.com" --role=roles/secretmanager.secretAccessor --project=$P | Out-Null
} finally { Remove-Item $tmp.FullName -Force }
Write-Host 'Done: secret database-url saved.'
