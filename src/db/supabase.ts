import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env';

// Server-side client using the service-role key. Bypasses RLS — never expose
// this client (or its key) to mobile/web bundles.
//
// Use Supabase JS for: single-row reads by PK or unique key, single-column
// updates, and listing reads with no joins.
// Use pg.Pool (db/client.ts) for: transactions, FOR UPDATE, joins, aggregates,
// PostGIS. The bid acceptance flow MUST always go through pg.
export const supabase: SupabaseClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);
