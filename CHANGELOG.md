# Changelog

## 2026-02-12 — Supabase → SQLite Migration

### Summary
Replaced Supabase (remote PostgreSQL) with local SQLite via `better-sqlite3`. All 16 existing user profiles were migrated.

### Changes

**New files:**
- `lib/db.ts` — SQLite database layer with helpers: `getProfileByPrivyId`, `updateProfile`, `upsertProfile`, `deleteProfile`, `updateBalance`
- `lib/types.ts` — Moved TypeScript interfaces (Profile, Chat, Message) from `lib/supabase/types.ts`
- `scripts/seed-db.ts` — Seeds the database with 16 existing profiles
- `data/c0mpute.db` — SQLite database file (gitignored)

**Updated files:**
- `app/api/profile/route.ts` — Uses `lib/db` instead of Supabase
- `app/api/profile/refresh-balance/route.ts` — Uses `lib/db` instead of Supabase
- `app/api/profile/delete/route.ts` — Uses `lib/db` instead of Supabase
- `app/api/profile/increment-prompts/route.ts` — Uses `lib/db` instead of Supabase
- `app/api/auth/callback/route.ts` — Uses `lib/db` instead of Supabase
- `hooks/useAuth.ts` — Import types from `lib/types` instead of `lib/supabase/types`
- `app/user/page.tsx` — Import types from `lib/types` instead of `lib/supabase/types`
- `.env.local` — Removed Supabase env vars
- `.gitignore` — Added `/data/` directory
- `package.json` — Removed `@supabase/ssr` and `@supabase/supabase-js`, added `better-sqlite3` and `@types/better-sqlite3`

**Deprecated (can be deleted):**
- `lib/supabase/client.ts`
- `lib/supabase/server.ts`
- `lib/supabase/types.ts`
- `lib/supabase/schema.sql`

### API signatures
All API route signatures remain unchanged — no frontend changes needed.
