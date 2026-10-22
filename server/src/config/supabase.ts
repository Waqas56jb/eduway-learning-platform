/**
 * Supabase HTTP clients.
 *  - `supabaseAnon`    — public anon key; only for operations that must run as an anonymous client.
 *  - `supabaseService` — service role; server-side only (Storage signed URLs, Auth admin mirror).
 *
 * The project is SHARED: only ever touch prefixed buckets (BUCKETS) and auth users whose
 * app_metadata.app === "eduway_platform".
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env.js';

const common = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { headers: { 'x-application-name': 'eduway-server' } },
} as const;

export const supabaseAnon: SupabaseClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, common);

export const supabaseService: SupabaseClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, common);
