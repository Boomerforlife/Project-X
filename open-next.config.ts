// OpenNext (Cloudflare) configuration for the web app. See docs/DEPLOYMENT.md section 5 and docs/DEPLOY_FACTS.md 2.5.
//
// Caching choices (needed for on-demand revalidation: the API calls POST /api/revalidate/ -> revalidateTag):
//  - incremental cache: R2 (binding NEXT_INC_CACHE_R2_BUCKET)
//  - tag cache: D1 "next mode" (binding NEXT_TAG_CACHE_D1, table `revalidations` is created by `opennextjs-cloudflare deploy`).
//    Chosen over the sharded Durable Object tag cache: one small D1 database is simpler to operate and needs no extra DO
//    migration. Its "next mode" understands Next 16 stale/expire semantics. Switch to doShardedTagCache only if D1 latency
//    or limits become a problem (see https://opennext.js.org/cloudflare/caching).
//  - revalidation queue: Durable Object queue (binding NEXT_CACHE_DO_QUEUE, class DOQueueHandler)
//  - no regional cache wrapper: it would delay revalidateTag per region. Add withRegionalCache only after staging tests.
//  - cache interception stays OFF (it does not work with PPR, and this app uses partialPrefetching/cacheComponents).
import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import d1NextTagCache from "@opennextjs/cloudflare/overrides/tag-cache/d1-next-tag-cache";
import doQueue from "@opennextjs/cloudflare/overrides/queue/do-queue";

const config = {
  ...defineCloudflareConfig({
    incrementalCache: r2IncrementalCache,
    tagCache: d1NextTagCache,
    queue: doQueue,
    enableCacheInterception: false,
  }),
  // The root package.json has no plain `build` script; the Next build is `build:web`.
  buildCommand: "npm run build:web",
};

export default config;
