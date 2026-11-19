/**
 * /ads.txt (IAB Authorized Digital Sellers). Required for AdSense to serve at full fill on tabbyprep.in.
 * Built from the AdSense publisher id (public by design; see src/lib/ads/config.ts). f08c47fec0942fa0 is Google's published certification
 * authority id for google.com. When no publisher id is configured the file says so instead of listing a fake seller.
 */
import { ADS_CONFIG } from "@/lib/ads/config";

const client = ADS_CONFIG.client;

export function GET() {
  const pub = /^ca-pub-(\d{10,20})$/.exec(client)?.[1];
  const body = pub ? `google.com, pub-${pub}, DIRECT, f08c47fec0942fa0\n` : "# No authorised ad sellers configured.\n";
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
