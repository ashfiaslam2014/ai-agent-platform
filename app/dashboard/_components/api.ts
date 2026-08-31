import { supabase } from "@/lib/supabase";

/**
 * fetch() with the current Supabase session token attached. Use for any
 * dashboard call that mutates data — the API routes gate on it via
 * lib/auth.ts requireBusinessAccess().
 */
export async function authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const headers = new Headers(init.headers);
  if (session?.access_token) headers.set("Authorization", `Bearer ${session.access_token}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return fetch(input, { ...init, headers });
}
