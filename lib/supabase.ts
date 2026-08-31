import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Client type used across lib/ modules. Uses the inferred type of the exported
// client (permissive, like the rest of the codebase). lib/database.types.ts holds
// the generated schema if we adopt a typed client later.
export type AppSupabaseClient = typeof supabase

// Lazy getter — supabaseAdmin is only created when first called at runtime,
// not at build time. This prevents Vercel from throwing on missing env vars.
let _supabaseAdmin: AppSupabaseClient | null = null

export function getSupabaseAdmin() {
  if (!_supabaseAdmin) {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
    _supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)
  }
  return _supabaseAdmin
}
