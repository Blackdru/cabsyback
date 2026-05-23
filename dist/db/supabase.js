"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabase = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const env_1 = require("../config/env");
// Server-side client using the service-role key. Bypasses RLS — never expose
// this client (or its key) to mobile/web bundles.
//
// Use Supabase JS for: single-row reads by PK or unique key, single-column
// updates, and listing reads with no joins.
// Use pg.Pool (db/client.ts) for: transactions, FOR UPDATE, joins, aggregates,
// PostGIS. The bid acceptance flow MUST always go through pg.
exports.supabase = (0, supabase_js_1.createClient)(env_1.env.SUPABASE_URL, env_1.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
});
//# sourceMappingURL=supabase.js.map