/**
 * Token provider for private (student) calls. W-C registers one at startup
 * (Supabase session or dev token). Public calls never use it.
 */
export type TokenProvider = () => Promise<string | null>;

let provider: TokenProvider = async () => null;

export function setTokenProvider(p: TokenProvider): void {
  provider = p;
}

export async function getToken(): Promise<string | null> {
  try {
    return await provider();
  } catch {
    return null;
  }
}
