/**
 * Ad configuration. NEXT_PUBLIC_* values are inlined at build time (one build per environment), so every name below is
 * written out literally. Nothing here is secret: AdSense publisher ids and ad unit ids are public by design.
 *
 *   NEXT_PUBLIC_ADS                    off (default) | test | live
 *   NEXT_PUBLIC_ADSENSE_CLIENT         ca-pub-XXXXXXXXXXXXXXXX
 *   NEXT_PUBLIC_ADSENSE_SLOT_DISPLAY   display unit (responsive)      e.g. 1234567890
 *   NEXT_PUBLIC_ADSENSE_SLOT_INFEED    in-feed unit (between list rows)
 *   NEXT_PUBLIC_ADSENSE_INFEED_LAYOUT_KEY   in-feed layout key from the AdSense code (e.g. -fb+5w+4e-db+86)
 *   NEXT_PUBLIC_ADSENSE_SLOT_MULTIPLEX multiplex (native "recommended content" grid) unit
 *   NEXT_PUBLIC_GAM_REWARDED_UNIT      Google Ad Manager rewarded unit path, e.g. /1234567/tabby_rewarded_web
 *   NEXT_PUBLIC_ADS_NPA                on (default) | off   request non-personalised ads (audience includes minors)
 *   NEXT_PUBLIC_ADS_POLICY             optional JSON overriding the frequency policy (see policy.ts)
 *
 * test mode: AdSense units are requested with data-adtest="on" (no billable impressions) and the rewarded unit falls back
 * to Google's documented sample unit. Never point real traffic at test mode in production, and never click your own ads.
 */

export type AdsMode = "off" | "test" | "live";

const mode = (v: string | undefined): AdsMode => (v === "live" ? "live" : v === "test" ? "test" : "off");

/** Google's public sample rewarded unit (developers.google.com/publisher-tag/samples/display-rewarded-ad). */
export const GAM_SAMPLE_REWARDED_UNIT = "/22639388115/rewarded_web_example";

const clean = (v: string | undefined) => (v ?? "").trim();

/** TabbyPrep AdSense publisher id (AdSense account, approved site tabbyprep.in). */
export const ADSENSE_PUBLISHER_ID = "ca-pub-2970121715798701";

export const ADS_CONFIG = {
  mode: mode(process.env.NEXT_PUBLIC_ADS),
  // Defaults to the TabbyPrep publisher id (public by design) so site verification and ads.txt work in every build.
  // Ads still load only when NEXT_PUBLIC_ADS is test or live.
  client: clean(process.env.NEXT_PUBLIC_ADSENSE_CLIENT) || ADSENSE_PUBLISHER_ID,
  slots: {
    display: clean(process.env.NEXT_PUBLIC_ADSENSE_SLOT_DISPLAY),
    infeed: clean(process.env.NEXT_PUBLIC_ADSENSE_SLOT_INFEED),
    infeedLayoutKey: clean(process.env.NEXT_PUBLIC_ADSENSE_INFEED_LAYOUT_KEY),
    multiplex: clean(process.env.NEXT_PUBLIC_ADSENSE_SLOT_MULTIPLEX),
  },
  rewardedUnit: clean(process.env.NEXT_PUBLIC_GAM_REWARDED_UNIT),
  nonPersonalized: clean(process.env.NEXT_PUBLIC_ADS_NPA) !== "off",
  policyJson: clean(process.env.NEXT_PUBLIC_ADS_POLICY),
} as const;

export type AdFormat = "display" | "infeed" | "multiplex";

/** A real AdSense request can be made for this format (publisher id + unit id present, ads not off). */
export function adsenseReady(format: AdFormat): boolean {
  if (ADS_CONFIG.mode === "off" || !/^ca-pub-\d{10,20}$/.test(ADS_CONFIG.client)) return false;
  const slot = ADS_CONFIG.slots[format];
  if (!/^\d{6,20}$/.test(slot)) return false;
  return format !== "infeed" || ADS_CONFIG.slots.infeedLayoutKey.length > 0;
}

/** Rewarded unit to request, or null when rewarded ads are not configured. */
export function rewardedUnit(): string | null {
  if (ADS_CONFIG.mode === "off") return null;
  if (ADS_CONFIG.rewardedUnit.startsWith("/")) return ADS_CONFIG.rewardedUnit;
  return ADS_CONFIG.mode === "test" ? GAM_SAMPLE_REWARDED_UNIT : null;
}
