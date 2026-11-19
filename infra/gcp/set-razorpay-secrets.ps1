# Run this yourself in PowerShell. Values never go into chat, git or shell history.
# Razorpay Dashboard (TEST mode) -> Account & Settings -> API Keys: Key Id (rzp_test_...) and Key Secret.
# Webhook secret: the secret you type when adding the webhook (Settings -> Webhooks), URL:
#   https://projectx-api-989800061583.asia-south1.run.app/api/v1/billing/webhooks/razorpay
#   events: order.paid, payment.captured, payment.failed, refund.processed
# Then ask Claude to redeploy the API; billing switches on only when all three secrets exist.
# 'Continue' on purpose: gcloud prints harmless messages to stderr. Real failures are caught via the exit code.
$ErrorActionPreference = 'Continue'
$P = 'projectx-staging-a7k2'
$SA = "projectx-api@$P.iam.gserviceaccount.com"
function Check($what) { if ($LASTEXITCODE -ne 0) { throw "FAILED: $what" } }

function Save-Secret($name, $prompt, $pattern) {
  $secure = Read-Host $prompt -AsSecureString
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)).Trim()
  if ($plain -notmatch $pattern) {
    # Describe the problem without ever printing the value.
    $why = if ($plain.Length -eq 0) { 'nothing was received (the paste may not have gone in: try right-click to paste, then Enter)' }
           elseif ($plain -match '\s') { "it contains a space or line break ($($plain.Length) characters)" }
           elseif ($plain -match '[^A-Za-z0-9_]') { "it contains symbols other than letters/digits ($($plain.Length) characters)" }
           else { "it is $($plain.Length) characters long" }
    throw "That does not look like a valid value for ${name}: $why. Nothing was saved for it; run the script again."
  }
  $tmp = Join-Path ([IO.Path]::GetTempPath()) ("rzp-" + [Guid]::NewGuid().ToString('N') + ".txt")
  try {
    [IO.File]::WriteAllText($tmp, $plain)
    $dataFile = "--data-file=$tmp"
    $existing = gcloud secrets list --project=$P --filter="name~$name" --format="value(name)" 2>$null
    if ($existing) { gcloud secrets versions add $name $dataFile --project=$P; Check "update $name" }
    else { gcloud secrets create $name $dataFile --replication-policy=user-managed --locations=asia-south1 --project=$P; Check "create $name" }
    gcloud secrets add-iam-policy-binding $name --member="serviceAccount:$SA" --role=roles/secretmanager.secretAccessor --project=$P | Out-Null
    Check "grant API access to $name"
  } finally { if (Test-Path $tmp) { Remove-Item $tmp -Force } }
}

Save-Secret 'razorpay-key-id' 'Razorpay Key Id (rzp_test_...)' '^rzp_(test|live)_[A-Za-z0-9]+$'
Save-Secret 'razorpay-key-secret' 'Razorpay Key Secret' '^[A-Za-z0-9]{16,}$'
Save-Secret 'razorpay-webhook-secret' 'Razorpay Webhook Secret' '^.{12,}$'
Write-Host 'Done: all three Razorpay secrets saved. Ask Claude to redeploy the API to switch billing on.'
