"use client";
/**
 * The advertising manager. One per app. Holds:
 *  - eligibility from the server (GET /entitlements): Plus users and failures get NO ads (fail closed),
 *  - the device class, the frequency policy (src/lib/ads/policy.ts) and per-tab pacing counters,
 *  - a per-page slot budget, so a page never carries more than `maxSlotsPerPage` units however many components ask.
 * It reads no request-time data while rendering (path is read in effects), so it can wrap the whole app.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Entitlements } from "@projectx/contracts";
import { ADS_CONFIG } from "@/lib/ads/config";
import { EMPTY_SESSION, deviceFor, resolvePolicy, type AdPolicy, type AdSessionState, type Device } from "@/lib/ads/policy";
import { entitlements as fetchEntitlements } from "@/lib/api/monetization";
import { useAuthStatus } from "@/lib/session/store";

const SESSION_KEY = "tabby.ads.session";

function readSession(): AdSessionState {
  try {
    const v = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "null") as Partial<AdSessionState> | null;
    return { ...EMPTY_SESSION, ...(v ?? {}) };
  } catch {
    return EMPTY_SESSION;
  }
}
function writeSession(s: AdSessionState) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {
    /* pacing is a convenience; without storage the server-side caps still hold */
  }
}

export interface AdsApi {
  /** Entitlements resolved (or failed). Until then nothing renders. */
  ready: boolean;
  entitlements: Entitlements | null;
  /** Display/in-feed ads may be shown to this viewer. */
  eligible: boolean;
  device: Device;
  policy: AdPolicy;
  /** Reserve one of this page's slots; false when the page budget is used up. Release on unmount. */
  claim(): boolean;
  release(): void;
  session(): AdSessionState;
  noteDisplay(): void;
  noteRewardedStart(): void;
  refresh(): void;
}

const noop = () => undefined;
const AdsContext = createContext<AdsApi>({
  ready: false,
  entitlements: null,
  eligible: false,
  device: "desktop",
  policy: resolvePolicy(""),
  claim: () => false,
  release: noop,
  session: () => EMPTY_SESSION,
  noteDisplay: noop,
  noteRewardedStart: noop,
  refresh: noop,
});

export function useAds(): AdsApi {
  return useContext(AdsContext);
}

export function AdsProvider({ children }: { children: React.ReactNode }) {
  const { status } = useAuthStatus();
  const [ent, setEnt] = useState<Entitlements | null | undefined>(undefined);
  const [device, setDevice] = useState<Device>("desktop");
  const [tick, setTick] = useState(0);
  const policy = useMemo(() => resolvePolicy(ADS_CONFIG.policyJson), []);
  const budget = useRef<{ path: string; used: number }>({ path: "", used: 0 });

  useEffect(() => {
    if (status === "loading") return;
    let live = true;
    void fetchEntitlements().then((e) => {
      if (live) setEnt(e);
    });
    return () => {
      live = false;
    };
  }, [status, tick]);

  useEffect(() => {
    const update = () => setDevice(deviceFor(window.innerWidth));
    update();
    window.addEventListener("resize", update, { passive: true });
    return () => window.removeEventListener("resize", update);
  }, []);

  const claim = useCallback(() => {
    const path = window.location.pathname;
    if (budget.current.path !== path) budget.current = { path, used: 0 };
    if (budget.current.used >= policy.maxSlotsPerPage[deviceFor(window.innerWidth)]) return false;
    budget.current.used += 1;
    return true;
  }, [policy]);
  const release = useCallback(() => {
    if (budget.current.path === window.location.pathname && budget.current.used > 0) budget.current.used -= 1;
  }, []);
  const noteDisplay = useCallback(() => {
    const s = readSession();
    writeSession({ ...s, displayShown: s.displayShown + 1 });
  }, []);
  const noteRewardedStart = useCallback(() => {
    const s = readSession();
    writeSession({ ...s, rewardedStarted: s.rewardedStarted + 1, lastRewardedAt: Date.now() });
  }, []);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const api = useMemo<AdsApi>(
    () => ({
      ready: ent !== undefined,
      entitlements: ent ?? null,
      eligible: !!ent?.ads.eligible,
      device,
      policy,
      claim,
      release,
      session: readSession,
      noteDisplay,
      noteRewardedStart,
      refresh,
    }),
    [ent, device, policy, claim, release, noteDisplay, noteRewardedStart, refresh],
  );
  return <AdsContext.Provider value={api}>{children}</AdsContext.Provider>;
}
