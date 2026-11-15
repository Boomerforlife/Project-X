import { timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { z } from "zod";

/**
 * On-demand revalidation webhook. The API POSTs the cache tags it purged
 * (publish, unpublish, edits, disputes) so Next's "use cache" entries that were
 * tagged with them are dropped. POST only; bearer secret from REVALIDATE_SECRET.
 */
const Body = z.object({
  tags: z.array(z.string().regex(/^[a-z0-9:_-]{1,256}$/i)).min(1).max(200),
});

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  // Compare equal-length digests of lengths so timingSafeEqual never throws and length is not leaked by an early return.
  const len = Math.max(ab.length, bb.length, 1);
  const pa = Buffer.alloc(len);
  const pb = Buffer.alloc(len);
  ab.copy(pa);
  bb.copy(pb);
  return timingSafeEqual(pa, pb) && ab.length === bb.length;
}

export async function POST(request: Request) {
  const secret = process.env.REVALIDATE_SECRET;
  // Disabled unless the secret is long enough to resist guessing.
  if (!secret || secret.length < 32) return Response.json({ error: "Not found" }, { status: 404 });

  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!safeEqual(token, secret)) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return Response.json({ error: "Invalid body" }, { status: 400 });

  for (const tag of parsed.data.tags) revalidateTag(tag, { expire: 0 });
  return Response.json({ revalidated: parsed.data.tags.length });
}
