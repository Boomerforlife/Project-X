"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_CONFIG } from "./config";

let client: SupabaseClient | null = null;

/** Browser-only singleton. Only the public URL + publishable key are used (never a service-role key). */
export function supabase(): SupabaseClient {
  if (!SUPABASE_CONFIG.url || !SUPABASE_CONFIG.key) throw new Error("Supabase is not configured");
  client ??= createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.key, {
    auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true },
  });
  return client;
}
