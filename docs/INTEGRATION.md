# Lumexia — Cross-Repo Integration

Reference for the two-repo Lumexia ecosystem. Maintained alongside `PROJECT_DOCS.md`; the latter focuses on the racing game internals, this one on how the racing game and the landing page meet at Supabase.

> Last updated: 2026-05-01 (Sprint 3 wrap-up)

---

## Repos

| Role | Repo | Stack | Hosting |
|---|---|---|---|
| Racing game | https://github.com/blaixs-max/my-racing-game-2 | Vite + React + Three.js + @solana/wallet-adapter | Netlify (game.lumexia.net) |
| Landing | https://github.com/blaixs-max/v0-lumexia-landing-page-V0 | Next.js 16 + Supabase JS | Vercel + Netlify (lumexia.net) |

Both connect to **the same Supabase project**: `cldjwajhcepyzvmwjcmz` (eu-central-1, Postgres 17).

---

## Shared Supabase Surface

### Tables read by both repos

| Table | Racing reads/writes | Landing reads | Notes |
|---|---|---|---|
| `users` | r/w via `verify-payment` Edge Fn (service role) | r (lookups by wallet) | Anon SELECT preserved |
| `transactions` | w via `verify-payment` (service role) | r (TransactionsPanel realtime feed) | Anon SELECT preserved |
| `scores` | w via `submit-score` Edge Fn (anti-cheat) | r (PoolContext counts today's scores) | Anon SELECT preserved; INSERT locked to service_role since Sprint 2.1 |
| `daily_leaderboard` | w via trigger on scores INSERT | r (LeaderboardSection) | Anon SELECT preserved |
| `daily_leaderboard_history` | w via `archive_daily_leaderboard` (pg_cron) | r (history view, optional) | |
| `reward_pool_distribution` | w via `calculate-daily-rewards` Edge Fn (pg_cron) | r (potential reward UI) | USD-denominated since Sprint 1.7b |

### Tables internal to backend only (anon cannot SELECT)

- `rate_limits` — service-role only, RLS enabled with no policies (by design; documented via `COMMENT ON TABLE`)
- `suspicious_scores` — same pattern; forensic log written by `submit-score` Edge Fn

---

## Edge Functions

| Function | Caller | Auth |
|---|---|---|
| `verify-payment` | Racing frontend (anon key + signed tx) | `verify_jwt: true` |
| `use-credit` | Racing frontend (anon key) | `verify_jwt: true` |
| `submit-score` | Racing frontend (anon key) | `verify_jwt: true` (since Sprint 2.2a) |
| `calculate-daily-rewards` | pg_cron (`pg_net.http_post` without JWT) | `verify_jwt: false` (since Sprint 1.7b) |

All four functions create a service-role Supabase client internally; that client bypasses RLS and is the only path that writes to `users`, `scores`, `transactions`, `suspicious_scores`, and `reward_pool_distribution` post-2.1.

---

## Environment Variables

### Racing repo (Vite)

`.env.local` / Netlify env panel:
```
VITE_SUPABASE_URL=https://cldjwajhcepyzvmwjcmz.supabase.co
VITE_SUPABASE_ANON_KEY=<the project's publishable anon key>
VITE_HELIUS_API_KEY=<domain-restricted public key>
VITE_WALLETCONNECT_PROJECT_ID=<optional>
```

### Landing repo (Next.js)

`.env.local` / Vercel + Netlify env panels:
```
NEXT_PUBLIC_SUPABASE_URL=https://cldjwajhcepyzvmwjcmz.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<same anon key as racing>
```

⚠️ Sprint 3a dropped the legacy `NEXT_PUBLIC_LEADERBOARD_SUPABASE_*` fallback. If only the legacy names are set in an env panel, the landing's leaderboard, transactions panel, and pool indicator will go dark with a console warning. Action: confirm the canonical names are present on every deploy target.

### Edge Function Secrets (Supabase Dashboard → Project Settings → Edge Functions → Secrets)

```
SUPABASE_URL=<auto>
SUPABASE_SERVICE_ROLE_KEY=<auto>
HELIUS_API_KEY=<private key, no domain restriction>
PAYMENT_TOKEN_MINT=H8xQ6poBjB9DTPMDTKWzWPrnxu4bDEhybxiouF8Ppump
TOKEN_SYMBOL=TOKABU
TOKEN_DECIMALS=6
PAYMENT_RECEIVER_ADDRESS=T6EkvAVdHPRr6Ngub1vk7VTzqtgw2KoGJwA8RCJmmGg
```

`verify-payment` reads `PAYMENT_RECEIVER_ADDRESS` first, then the legacy `PAYMENT_RECEIVER` (Sprint 1.8 fallback chain), then falls back to a hardcoded canonical receiver.

### CI/CD Secrets (GitHub Actions, racing repo only)

```
SUPABASE_ACCESS_TOKEN  — for supabase CLI auth
SUPABASE_PROJECT_ID    — cldjwajhcepyzvmwjcmz
SUPABASE_DB_PASSWORD   — for `supabase db push` in deploy-migrations.yml
```

---

## Realtime Subscriptions (Landing)

| Channel | Filter | Component | Behaviour |
|---|---|---|---|
| `pool_scores_changes` | `INSERT` on `public.scores` | `lib/pool-context.tsx` | 1-second debounce; refetches today's count |
| `recent_transactions_changes` | `INSERT` on `public.transactions` | `components/transactions-panel.tsx` | 1-second debounce; refetches last 10 successful rows |

Both subscriptions are gated by `getSupabase()` returning a client; if env vars are missing, the subscription is silently skipped and the UI falls back to its initial empty state.

---

## TypeScript Type Sync

Landing's `lib/database.types.ts` is auto-generated. Refresh recipe:

```bash
# After landing a migration via deploy-migrations.yml on the racing repo:
# 1. From a Claude session with Supabase MCP loaded:
#    call generate_typescript_types(project_id="cldjwajhcepyzvmwjcmz")
# 2. Replace the body of landing/lib/database.types.ts with the output
# 3. Open a small PR in the landing repo
```

This keeps the landing's compile-time types in lock-step with the migrated schema. The two views (`alltime_leaderboard`, `daily_team_scores`) are picked up automatically.

The racing repo is JavaScript and does not consume the Database type today; if it migrates to TS later, the same generator output can be shared.

---

## Migration Discipline

Migrations live under `supabase/migrations/` in the **racing** repo only. The landing repo never writes SQL.

- Naming: `YYYYMMDDHHMMSS_description.sql` (14-digit timestamp)
- CI: `.github/workflows/deploy-migrations.yml` runs `supabase db push` on every merge to `main` that touches `supabase/migrations/**`
- First run was Sprint 2.4; the workflow includes an idempotent `supabase migration repair --status applied` step for the seven pre-existing versions
- A "stub" migration is acceptable when the SQL was applied manually before discipline was set up — see `20251207161419_create_reward_pool_distribution_table.sql` for the pattern

---

## Cross-Repo Smoke Walk (manual, when in doubt)

1. **Game flow:** open https://game.lumexia.net, connect Phantom, post a score
2. **DB:** Supabase Dashboard → Table editor → `scores` table — most recent row should match
3. **Landing leaderboard:** open https://lumexia.net → "Daily Ranking" — your wallet should appear within ~1s (debounced realtime)
4. **TransactionsPanel:** if you also bought credits, https://lumexia.net should show the row in "Recent Transactions" within ~1s

If any of these break, suspect an env var rename or RLS regression first.

---

## Closed-Loop Test Plan

A dedicated E2E test sprint is queued in `~/.claude/projects/.../memory/project_test_sprint_plan.md`. It will codify the smoke walk above into Playwright + Supabase MCP assertions, and add anti-cheat fuzz, RBAC, and rate-limit suites. See that memory file for the full 8-layer plan.
