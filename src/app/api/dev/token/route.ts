import { SignJWT } from "jose";

/**
 * Offline dev login. Returns 404 unless this is a non-production build with
 * NEXT_PUBLIC_AUTH_MODE=dev. The secret must equal the API's TEST_JWT_SECRET.
 * Never reachable in production: the whole handler is gated on NODE_ENV.
 */
const USERS = {
  dev1: { id: "e0000000-0000-4000-8000-000000000001", email: "dev1@projectx.local" },
  dev2: { id: "e0000000-0000-4000-8000-000000000002", email: "dev2@projectx.local" },
  admin: { id: "e0000000-0000-4000-8000-0000000000a1", email: "admin@projectx.local" },
} as const;

const enabled = () => process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_AUTH_MODE === "dev";

export async function POST(req: Request) {
  if (!enabled()) return new Response("Not found", { status: 404 });
  const secret = process.env.DEV_TEST_JWT_SECRET;
  if (!secret || secret.length < 32) {
    return Response.json({ error: "DEV_TEST_JWT_SECRET (>= 32 chars) is not set" }, { status: 500 });
  }
  const body = (await req.json().catch(() => null)) as { user?: string } | null;
  const key = body?.user;
  if (key !== "dev1" && key !== "dev2" && key !== "admin") return Response.json({ error: "unknown dev user" }, { status: 400 });
  const u = USERS[key];
  const expiresInSec = 12 * 3600;
  const token = await new SignJWT({ role: "authenticated", email: u.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(u.id)
    .setAudience("authenticated")
    .setIssuedAt()
    .setExpirationTime(`${expiresInSec}s`)
    .sign(new TextEncoder().encode(secret));
  return Response.json({ token, user: key, userId: u.id, email: u.email, expiresAt: Date.now() + expiresInSec * 1000 }, { headers: { "Cache-Control": "no-store" } });
}
