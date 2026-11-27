import { liveTracks } from "@/lib/live-tracks";
import { SiteHeader } from "./Header";
import { Wordmark } from "./Wordmark";

export { SiteHeader, Wordmark };

/**
 * The one site header, used by every layout that has chrome (public pages, signed-in app, 404). Items depend on auth
 * state, never on the route group. An exam section (NEET) only appears once it has published questions.
 */
export async function PublicSiteHeader() {
  const live = await liveTracks();
  return <SiteHeader hidden={live.includes("neet") ? [] : ["/neet/"]} />;
}
