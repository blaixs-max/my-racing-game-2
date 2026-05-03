# Manual Payout Runbook — Cycle Reward Distribution

> **Audience:** Lumexia ops team
> **Frequency:** Every 48 hours (cycle end, 00:00 UTC even-day offset from anchor `2026-05-01`)
> **Estimated time:** 15–30 minutes per cycle (≤ 100 winners)

This runbook walks through the manual workflow for paying out a single cycle's reward winners. The reward calculation itself is fully automated by `calculate-daily-rewards`; this document covers everything that happens **after** the Edge Function writes the per-wallet rows.

---

## Prerequisites

- Supabase Dashboard access (project `cldjwajhcepyzvmwjcmz` / "blaixs-max's Project")
- Treasury wallet (`PAYMENT_RECEIVER_ADDRESS` = `T6EkvAVdHPRr6Ngub1vk7VTzqtgw2KoGJwA8RCJmmGg`) — Phantom or CLI access
- The treasury holds enough TOKABU **and** SOL to cover the cycle's net pool plus per-transfer SOL gas fees (≈ 0.000005 SOL per transfer × 100 = 0.0005 SOL minimum)

---

## Cycle Schedule Quick Reference

The 48h cycle is anchored at `2026-05-01 00:00 UTC`. Cycle-end days are even-day offsets:

| Cycle | Window | Cycle-end (payout day) |
|-------|--------|------------------------|
| 1 | 2026-05-01 → 2026-05-03 | 2026-05-03 00:00 UTC |
| 2 | 2026-05-03 → 2026-05-05 | 2026-05-05 00:00 UTC |
| 3 | 2026-05-05 → 2026-05-07 | 2026-05-07 00:00 UTC |
| ... | every 48h | every other day |

`reward_pool_distribution.reward_date` is set to the **cycle start** (e.g. `2026-05-01` for Cycle 1).

---

## Step 1 — Verify the Edge Function ran successfully

Within the first 5 minutes of the cycle-end timestamp, the pg_cron job triggers `calculate-daily-rewards`. Confirm it succeeded **before** doing anything else.

### 1a. Check Edge Function logs (Dashboard → Edge Functions → calculate-daily-rewards → Logs)

Look for a 200 response with a payload like:

```json
{
  "success": true,
  "message": "Calculated rewards for 47 players (cycle 2026-05-03)",
  "totalGames": 156,
  "totalPoolUSD": 156,
  "netPoolUSD": 144.3,
  "prices": {
    "sol_usd": 200.12,
    "tokabu_usd_api": 0.000122,
    "tokabu_used_db_fallback": false,
    "tokabu_db_fallback_hits": 0,
    "tokabu_db_global_fallback": null
  }
}
```

**Things to verify:**
- `success: true` (not an error response)
- `prices.sol_usd` is non-null (SOL price retrieved)
- `prices.tokabu_used_db_fallback` is `false` (both TOKABU APIs healthy) **OR** `tokabu_db_fallback_hits` is the number of wallets priced from past transactions

### 1b. If `success: false` or no log entry exists

The cron job didn't fire or the function errored out. **Stop here**, investigate before proceeding:

```sql
-- Check that the cron job is still scheduled
SELECT jobid, schedule, command, active
FROM cron.job
WHERE command LIKE '%calculate-daily-rewards%';

-- Check if reward_pool_distribution has any rows for this cycle
SELECT COUNT(*) FROM reward_pool_distribution
WHERE reward_date = '2026-05-03';  -- replace with the missed cycle
```

**Recovery:** Manually invoke the function with service-role auth:

```bash
curl -X POST 'https://cldjwajhcepyzvmwjcmz.supabase.co/functions/v1/calculate-daily-rewards' \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

The function is idempotent (DELETE-then-INSERT keyed on `reward_date`), so a re-run is safe.

---

## Step 2 — Pull the unpaid winners

Open Supabase Dashboard → SQL Editor and run:

```sql
SELECT
  wallet_id,
  ROUND(reward_amount, 2)              AS usd,
  ROUND(reward_amount_tokabu, 4)       AS tokabu_amount,
  ROUND(reward_amount_sol, 6)          AS sol_amount,
  ROUND(tokabu_price_usd, 10)          AS tokabu_price_at_calc,
  ROUND(sol_price_usd, 4)              AS sol_price_at_calc,
  score                                AS boosted_score
FROM public.reward_pool_distribution
WHERE reward_date = '2026-05-03'   -- ⚠️  CHANGE THIS to the cycle you're paying
  AND paid_at IS NULL
ORDER BY reward_amount DESC;
```

**Replace `'2026-05-03'`** with the cycle-start date you're paying for.

The result is up to 100 rows. Hit "Download" → CSV.

### What if `tokabu_amount` or `sol_amount` is NULL?

It means the price source for that currency was unavailable at cycle end. You have two options:

**Option A (recommended) — Fill the price now and recompute:**

```sql
-- Look up the current TOKABU price (or SOL price) manually,
-- e.g. from DexScreener: https://dexscreener.com/solana/<MINT>
-- Then UPDATE the missing values for this cycle.

UPDATE public.reward_pool_distribution
SET
  tokabu_price_usd     = 0.000122,         -- ⚠️ replace with live price
  reward_amount_tokabu = ROUND(reward_amount / 0.000122, 4)
WHERE reward_date = '2026-05-03'
  AND tokabu_price_usd IS NULL;
```

(Same pattern for SOL: `sol_price_usd` + `reward_amount_sol`.)

**Option B — Pay only winners with a non-NULL amount in your chosen token.** Skipped winners stay `paid_at IS NULL` and are picked up in the next cycle's payout.

---

## Step 3 — Choose the payout token (per cycle)

For each cycle, decide whether to pay in **TOKABU** or **SOL**. Mixing is allowed but adds bookkeeping — easier to keep one cycle = one token.

| | TOKABU | SOL |
|--|--------|-----|
| Treasury balance check | `T6Ekv...mGg` TOKABU SPL balance ≥ sum of `reward_amount_tokabu` | SOL balance ≥ sum of `reward_amount_sol` + 0.0005 SOL gas buffer |
| Token volatility | Higher (LMX/USD price moves) | Lower (already a major coin) |
| Why pay in this token | Strengthens token utility, recipients become long-term holders | Liquid, recipients can swap immediately |

**Treasury balance check:**

```sql
-- Sum the chosen token across the cycle
SELECT
  SUM(reward_amount_tokabu) AS total_tokabu,
  SUM(reward_amount_sol)    AS total_sol,
  COUNT(*)                  AS recipient_count
FROM public.reward_pool_distribution
WHERE reward_date = '2026-05-03'
  AND paid_at IS NULL;
```

Confirm the treasury wallet holds at least that amount. If not, top up before transferring.

---

## Step 4 — Transfer the rewards

### Option A — Phantom batch transfer (UI, easiest for ≤ 50 recipients)

1. Open Phantom desktop with treasury wallet active
2. Use a batch-transfer extension (e.g. Solflare Batch, or any reputable bulk-sender) to import the CSV
3. Send

### Option B — CLI script (`@solana/web3.js` + `@solana/spl-token`)

A reusable Node.js script template (run locally with treasury keypair, **never** check the keypair into git):

```js
// payout.js — run with: node payout.js cycle=2026-05-03 token=TOKABU
import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import {
  getOrCreateAssociatedTokenAccount,
  transfer
} from '@solana/spl-token'
import fs from 'node:fs'
import csv from 'csv-parse/sync'

const TOKABU_MINT = new PublicKey('H8xQ6poBjB9DTPMDTKWzWPrnxu4bDEhybxiouF8Ppump')
const TOKEN_DECIMALS = 6

const treasury = Keypair.fromSecretKey(
  Buffer.from(JSON.parse(fs.readFileSync(process.env.TREASURY_KEY_PATH, 'utf-8')))
)
const connection = new Connection(process.env.HELIUS_RPC, 'confirmed')

const rows = csv.parse(fs.readFileSync('./payout.csv'), { columns: true })
const results = []

for (const row of rows) {
  const recipient = new PublicKey(row.wallet_id)
  const rawAmount = BigInt(Math.floor(parseFloat(row.tokabu_amount) * 10 ** TOKEN_DECIMALS))

  try {
    const treasuryAta = await getOrCreateAssociatedTokenAccount(
      connection, treasury, TOKABU_MINT, treasury.publicKey
    )
    const recipientAta = await getOrCreateAssociatedTokenAccount(
      connection, treasury, TOKABU_MINT, recipient
    )
    const sig = await transfer(
      connection, treasury, treasuryAta.address, recipientAta.address,
      treasury, rawAmount
    )
    results.push({ wallet: row.wallet_id, tx: sig, status: 'ok' })
    console.log(`✓ ${row.wallet_id} → ${row.tokabu_amount} TOKABU (${sig})`)
  } catch (err) {
    results.push({ wallet: row.wallet_id, tx: null, status: 'fail', err: String(err) })
    console.error(`✗ ${row.wallet_id}: ${err}`)
  }
}

fs.writeFileSync('./payout-results.json', JSON.stringify(results, null, 2))
```

**Output:** `payout-results.json` with one entry per recipient, including the TX signature for successful transfers.

---

## Step 5 — Mark winners as paid

After every successful transfer, write back the proof. Use one statement per recipient (or a CSV-driven batch UPDATE if you have many).

### Single-row template

```sql
UPDATE public.reward_pool_distribution
SET
  paid_at       = NOW(),
  paid_tx_hash  = '5XKc...your-solana-tx-signature',
  paid_in_token = 'TOKABU'  -- or 'SOL'
WHERE wallet_id   = 'T6Ekv...recipient-wallet'
  AND reward_date = '2026-05-03';
```

### Batch via CTE (when you have a list of (wallet, tx_hash) pairs)

```sql
WITH paid AS (
  SELECT * FROM (VALUES
    ('T6Ekv...wallet1', '5XKc...sig1'),
    ('Phant...wallet2', '7YHz...sig2'),
    ('SoLan...wallet3', '3KbN...sig3')
    -- ... add more rows
  ) AS t(wallet_id, paid_tx_hash)
)
UPDATE public.reward_pool_distribution r
SET
  paid_at       = NOW(),
  paid_tx_hash  = paid.paid_tx_hash,
  paid_in_token = 'TOKABU'  -- or 'SOL', whichever you sent
FROM paid
WHERE r.wallet_id   = paid.wallet_id
  AND r.reward_date = '2026-05-03';
```

---

## Step 6 — Verify nothing is left behind

Run the unpaid query again:

```sql
SELECT COUNT(*) AS still_unpaid
FROM public.reward_pool_distribution
WHERE reward_date = '2026-05-03'
  AND paid_at IS NULL;
```

**Expected:** `0`. If non-zero, walk through the list — each row is a recipient you haven't paid yet (or an UPDATE that didn't match because of a typo in the wallet address).

---

## Step 7 — Audit log (optional but recommended)

Solscan link template for documentation / community transparency:

```sql
SELECT
  wallet_id,
  paid_in_token,
  paid_tx_hash,
  'https://solscan.io/tx/' || paid_tx_hash AS solscan_url,
  paid_at
FROM public.reward_pool_distribution
WHERE reward_date = '2026-05-03'
ORDER BY paid_at DESC;
```

You can post the resulting list (TX links) on Twitter / Discord for community proof of payout.

---

## Troubleshooting

### "I accidentally paid the wrong amount to a wallet."

The mistake is on-chain (irreversible from the protocol side). Options:

1. **Coordinate refund with the recipient** off-chain (DM, ask them to return the difference)
2. **Compensate in the next cycle** — UPDATE the next cycle's row to subtract the overpayment

Do not edit `reward_amount` on past rows; the audit trail (Edge Function-calculated value) must remain immutable.

### "I paid a wallet, but `UPDATE` didn't match (no rows updated)."

Two common reasons:

1. **Wallet typo** — the on-chain transfer used a different address than what's in the DB. Compare carefully.
2. **Wrong cycle** — `reward_date` filter doesn't match the row's actual `reward_date`. Drop the date filter to find the row:
   ```sql
   SELECT * FROM reward_pool_distribution WHERE wallet_id = 'T6Ekv...';
   ```

### "The Edge Function ran but `tokabu_used_db_fallback: true`."

DexScreener and Jupiter both failed at cycle end. Each top-100 wallet was priced from the most recent past transaction price. This is **fine for the calculation** — the math still works — but you may want to manually refresh the price column before paying:

```sql
-- See the spread of fallback prices used
SELECT DISTINCT tokabu_price_usd
FROM reward_pool_distribution
WHERE reward_date = '2026-05-03'
ORDER BY tokabu_price_usd;
```

If they vary widely (e.g. wallet A at $0.0001 vs wallet F at $0.00015), consider pulling the current live price and overwriting all rows for fairness:

```sql
UPDATE public.reward_pool_distribution
SET
  tokabu_price_usd     = 0.000122,             -- ⚠️ live price
  reward_amount_tokabu = ROUND(reward_amount / 0.000122, 4)
WHERE reward_date = '2026-05-03';
```

### "I see rows from a cycle that's already been paid."

Sanity-check that you didn't run the manual `curl` invocation a second time after paying. The function is idempotent (DELETE → INSERT), but it **resets `paid_at`/`paid_tx_hash` to NULL** because it deletes the existing rows. If this happens, check your Solscan TX history and replay Step 5 with the previously-recorded tx hashes.

---

## Reference — Schema

```sql
\d public.reward_pool_distribution
```

| Column | Type | Filled by |
|--------|------|-----------|
| `id` | UUID PK | DB default |
| `wallet_id` | TEXT | Edge Function |
| `score` | INTEGER | Edge Function (boosted) |
| `reward_amount` | NUMERIC | Edge Function (USD canonical) |
| `reward_amount_sol` | NUMERIC | Edge Function (NULL on price-fetch fail) |
| `reward_amount_tokabu` | NUMERIC | Edge Function (NULL on price-fetch fail) |
| `sol_price_usd` | NUMERIC | Edge Function audit snapshot |
| `tokabu_price_usd` | NUMERIC | Edge Function audit snapshot |
| `reward_date` | DATE | Edge Function (cycle start) |
| `created_at` | TIMESTAMPTZ | DB default |
| `paid_at` | TIMESTAMPTZ | **Ops team — Step 5** |
| `paid_tx_hash` | TEXT | **Ops team — Step 5** |
| `paid_in_token` | TEXT (CHECK 'SOL'/'TOKABU') | **Ops team — Step 5** |

The partial index `idx_reward_unpaid (reward_date, wallet_id) WHERE paid_at IS NULL` makes Step 2's query fast even with thousands of rows accumulated over many cycles.

---

## Source Code References

- Edge Function: [`supabase/functions/calculate-daily-rewards/index.ts`](../../supabase/functions/calculate-daily-rewards/index.ts)
- Schema migration: [`supabase/migrations/20260503100000_reward_payment_tracking.sql`](../../supabase/migrations/20260503100000_reward_payment_tracking.sql)
- Cycle anchor migration: [`supabase/migrations/20260501160000_cycle_48h.sql`](../../supabase/migrations/20260501160000_cycle_48h.sql)
- Verify-payment (where transactions are written, used by the DB price fallback): [`supabase/functions/verify-payment/index.ts`](../../supabase/functions/verify-payment/index.ts)
