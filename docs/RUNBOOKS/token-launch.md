# Token Launch Runbook — Sprint 8

> **Audience:** Lumexia ops team
> **Trigger:** New token mint goes live; existing TOKABU economy is wound down
> **Estimated time:** 60-90 minutes for the cutover window itself; ~3-7 days of pre-launch prep

This runbook covers the one-time migration from TOKABU to the new Lumexia-issued token. Once executed, the racing game (`game.lumexia.net`) and the landing page (`lumexia.net`) will accept the new token for credit purchases and pay out cycle rewards in the new token's terms.

**Decisions locked in (2026-05-09 user call):**

- Token platform: **pump.fun** (same as TOKABU; decimals fixed at 6, automatic bonding-curve LP, instant DexScreener listing)
- Old TOKABU treasury balance: **wiped** (incinerated or moved out of receiver wallet pre-launch)
- Unpaid cycle rewards (`reward_pool_distribution.paid_at IS NULL`): **wiped** — clean slate, no carry-over to the new token

These two decisions mean: when the new token goes live, the system has no TOKABU obligations and the receiver wallet starts at 0. Everything from launch onward is denominated in the new token (with USD remaining the canonical reward unit per the existing Sprint 7-mini pipeline).

---

## Phase 0 — Pre-launch parameters (BLOCKER until filled)

The following must be decided before pump.fun launch. The PR scope and Supabase Secrets update both depend on these values.

| Parameter | Decision needed | Notes |
|-----------|-----------------|-------|
| **Token name** | (e.g. "Lumexia Token", "LumeX") | Used in `TOKEN_CONFIG.name`, agreement metadata |
| **Token symbol** | (e.g. `LUMEX`, `LMXV2`) | Used in `TOKEN_CONFIG.symbol`, agreement metni, balance UI, `transactions.token_symbol` for new rows |
| **Logo (256-512 PNG)** | Hosted on IPFS or Arweave | pump.fun handles upload; URL goes into `TOKEN_CONFIG.logoUrl` |
| **Receiver wallet** | Same `T6Ekv...mmGg` or new? | If new, treasury never holds new token + TOKABU together (cleaner audit). If same, no env change. |
| **Decimals** | **Fixed at 6** by pump.fun | No decision needed |
| **Total supply** | Fixed at 1,000,000,000 by pump.fun | No decision needed |
| **Mint authority** | Locked at launch by pump.fun | No decision needed |
| **Launch UTC timestamp** | Plan around cycle anchor | Cycle-end day (every other day from 2026-05-01) is cleanest — old cycle closes empty, new cycle starts with new token |

---

## Phase 1 — Pre-launch (T-7d to T-1d): TOKABU treasury wipe

Goal: by the time the new token goes live, the receiver wallet has 0 TOKABU and `reward_pool_distribution` has no unpaid rows.

### 1a. Verify current state

```sql
-- How many unpaid cycle reward rows do we have?
SELECT
  reward_date,
  COUNT(*)              AS unpaid_winners,
  ROUND(SUM(reward_amount), 2) AS unpaid_usd_total
FROM reward_pool_distribution
WHERE paid_at IS NULL
GROUP BY reward_date
ORDER BY reward_date DESC;

-- Receiver wallet TOKABU balance — check on Solscan
-- https://solscan.io/account/T6EkvAVdHPRr6Ngub1vk7VTzqtgw2KoGJwA8RCJmmGg
```

Decide: wipe SQL approach.

### 1b. Wipe unpaid cycle rewards

**Option A — DELETE (simpler, no audit trail):**

```sql
DELETE FROM reward_pool_distribution
WHERE paid_at IS NULL;
```

**Option B — UPDATE with cancelled marker (audit trail preserved):**

```sql
UPDATE reward_pool_distribution
SET
  paid_at = NOW(),
  paid_in_token = 'CANCELLED',
  paid_tx_hash = 'PRE_LAUNCH_WIPE_2026_xx_xx'
WHERE paid_at IS NULL;
```

> **Recommendation:** Option B. The CHECK constraint on `paid_in_token` (`SOL` / `TOKABU` / NULL) currently rejects `'CANCELLED'`. Run this migration first:
>
> ```sql
> ALTER TABLE reward_pool_distribution
>   DROP CONSTRAINT reward_pool_distribution_paid_in_token_check;
> ALTER TABLE reward_pool_distribution
>   ADD CONSTRAINT reward_pool_distribution_paid_in_token_check
>   CHECK (paid_in_token IN ('SOL', 'TOKABU', 'CANCELLED') OR paid_in_token IS NULL);
> ```
>
> Then run the UPDATE. After the new token launches, add the new symbol to the constraint.

### 1c. Wipe TOKABU from receiver wallet

The treasury team transfers all TOKABU out of `T6Ekv...mmGg`. Two destinations:

- **Burn (recommended for clean optics):** SPL incinerator address `1nc1nerator11111111111111111111111111111111`
- **Move to operations multisig:** any wallet not used for game payments

Use Phantom batch UI or a CLI script (template in `manual-payout.md` Step 5b). Verify on Solscan post-transfer that the receiver shows 0 TOKABU.

### 1d. Snapshot existing data

```sql
-- Total TOKABU spent historically (preserved as record)
SELECT
  COUNT(*) AS tokabu_payments,
  ROUND(SUM(amount), 2) AS total_usd,
  ROUND(SUM(token_amount), 4) AS total_tokabu
FROM transactions
WHERE status = 'success' AND token_symbol = 'TOKABU';
```

Save this output — it becomes the historical baseline. The `transactions` table is **not** wiped; old TOKABU rows stay for audit and tax purposes.

---

## Phase 2 — Launch (T-0): pump.fun create + verify DexScreener

1. Create token on pump.fun with the parameters from Phase 0
2. Capture mint address (e.g. `7xK...pump`) — record in a secure note
3. Wait ~60 seconds for pump.fun to publish to DexScreener
4. Open `https://dexscreener.com/solana/<MINT>` — confirm price + liquidity visible
5. Test fetch:
   ```bash
   curl "https://api.dexscreener.com/latest/dex/tokens/<MINT>" | jq '.pairs[0].priceUsd'
   ```
   Should return a non-null number. **If null, abort cutover and wait for indexing.**

---

## Phase 3 — Cutover (T+5m): code + secrets + merge

### 3a. Open the racing-repo PR (prepared as draft during Phase 1)

Files to update:

```
src/solana.config.js
  → TOKEN_CONFIG = {
      mint: '<NEW_MINT>',
      name: '<NEW_NAME>',
      symbol: '<NEW_SYMBOL>',
      decimals: 6,
      logoUrl: '<URL>'
    }

supabase/functions/verify-payment/index.ts
  → const PAYMENT_TOKEN_MINT = Deno.env.get('PAYMENT_TOKEN_MINT') ?? '<NEW_MINT>';
  → const TOKEN_SYMBOL = Deno.env.get('TOKEN_SYMBOL') ?? '<NEW_SYMBOL>';

supabase/functions/reconcile-payments/index.ts
  → same fallback updates

supabase/functions/calculate-daily-rewards/index.ts
  → const TOKABU_MINT = Deno.env.get('PAYMENT_TOKEN_MINT') ?? '<NEW_MINT>'
  → (rename internal const to NEW_TOKEN_MINT for clarity, optional)

docs/PROJECT_DOCS.md, docs/INTEGRATION.md, README.md
  → mint + symbol references

.env.example
  → comment updates
```

### 3b. Update Supabase Secrets (Dashboard → Project Settings → Edge Functions → Secrets)

```
PAYMENT_TOKEN_MINT = <NEW_MINT>
TOKEN_SYMBOL       = <NEW_SYMBOL>
TOKEN_DECIMALS     = 6
PAYMENT_RECEIVER_ADDRESS = <SAME_OR_NEW>
```

These take effect on the **next** Edge Function invocation — no redeploy needed.

### 3c. Merge the PR

CI runs (lint + build + test). On green, admin-merge to main. Netlify auto-deploys frontend.

### 3d. Verify deployment

```bash
# Frontend now requests new token symbol
curl https://game.lumexia.net | grep -o '<NEW_SYMBOL>'

# verify-payment Edge Function picks up new env
# (call with a test payload, expect "Failed to fetch <NEW_SYMBOL> token price"
# = Edge Function reading new secret correctly even before any payment)
```

---

## Phase 4 — Post-launch smoke test (T+15m to T+1h)

| Step | What | Expected |
|------|------|----------|
| 4a | Connect Phantom on `game.lumexia.net` | Token symbol displays new symbol; balance loads |
| 4b | Buy 1 credit ($1) with new token | TX confirms, `verify-payment` returns 200, credit balance = 1 |
| 4c | Race 1 game | `submit-score` returns 200, leaderboard shows wallet |
| 4d | DB check | `SELECT * FROM transactions ORDER BY created_at DESC LIMIT 1;` → `token_symbol = '<NEW_SYMBOL>'` |
| 4e | `reconcile-payments` dry run | `curl ...reconcile-payments -d '{"dryRun":true}'` → `newlyCredited: 0`, `alreadyCredited: 1` (just-paid TX) |

If any step fails, investigate before proceeding. Common issues:

- **`verify-payment` says "Token transfer not found":** receiver wallet not yet showing balance — wait 30s, retry
- **`tokabu_used_db_fallback: true` in Edge Function logs:** DexScreener/Jupiter not indexed yet; wait, do not panic
- **Frontend shows old symbol:** Netlify cache — hard reload or wait for deploy

---

## Phase 5 — First cycle-end with new token (T+24h to T+48h)

The first cycle-end day after launch:

```sql
-- Verify Edge Function wrote new currency rows
SELECT
  wallet_id,
  reward_amount,
  reward_amount_sol,
  reward_amount_tokabu,        -- column name unchanged for compat; holds NEW_TOKEN amount
  sol_price_usd,
  tokabu_price_usd             -- holds NEW_TOKEN/USD price
FROM reward_pool_distribution
WHERE reward_date = '<CYCLE_START_DATE>'
ORDER BY reward_amount DESC
LIMIT 5;
```

All 5 currency columns should be non-NULL. If `tokabu_price_usd` is NULL, the Edge Function fell back to the DB fallback chain — check logs to understand why DexScreener+Jupiter failed.

---

## Phase 6 — Cleanup (T+1 week)

- Rename internal Edge Function consts (e.g. `TOKABU_MINT` → `NEW_SYMBOL_MINT`) — cosmetic, plan in a separate refactor PR
- Update column comments on `reward_pool_distribution.reward_amount_tokabu` if column kept under old name
- Optional: rename `reward_amount_tokabu` to `reward_amount_token` via migration — touches landing repo's `database.types.ts`, plan carefully
- Community announcement: link to mint, DexScreener, post-launch FAQ

---

## Rollback plan

If a critical issue emerges in Phase 3-4 (e.g. `verify-payment` cannot detect new token transfers despite DexScreener being live), the rollback is:

1. Revert the racing-repo PR (regenerate config back to TOKABU values) — fast, but the wiped state from Phase 1 is irreversible
2. Revert Supabase Secrets to TOKABU values

Note: **the wipe in Phase 1 is one-way.** Once unpaid rewards and treasury TOKABU are gone, they cannot be restored. Do not start Phase 1 until Phase 0 parameters are locked and Phase 2 is scheduled within 24 hours.

---

## Reference — environment variable map

See `docs/INTEGRATION.md` for the canonical env var contract. The variables that change at launch:

```
# Racing repo (Vite, .env.local + Netlify panel)
# → Frontend re-reads on each build; Netlify auto-deploys post-merge

# Landing repo (Next.js, .env.local + Vercel/Netlify panels)
# → Same anon key, but lib/token-config.ts (if present) needs updating

# Supabase Edge Function Secrets (Dashboard → Project Settings → Functions)
PAYMENT_TOKEN_MINT       — change to new mint
TOKEN_SYMBOL             — change to new symbol
PAYMENT_RECEIVER_ADDRESS — change only if receiver wallet changes
TOKEN_DECIMALS           — stays at 6 (pump.fun fixed)
HELIUS_API_KEY           — unchanged
```
