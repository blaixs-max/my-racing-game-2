# Lumexia Racing Game

3D browser racing game on Solana. Players connect a Solana wallet (Phantom, Solflare, Coinbase, Trust), buy credits with the **TOKABU** SPL token, and race for daily-leaderboard rewards distributed in USD.

**Live:** [game.lumexia.net](https://game.lumexia.net) (Netlify)
**Landing:** [lumexia.net](https://lumexia.net) (separate repo: [v0-lumexia-landing-page-V0](https://github.com/blaixs-max/v0-lumexia-landing-page-V0))

---

## Tech Stack

- **Frontend:** Vite + React 19 + Three.js (`@react-three/fiber`, `@react-three/drei`, `@react-three/rapier`)
- **State:** Zustand
- **Wallet:** `@solana/wallet-adapter-react` (Phantom / Solflare / Coinbase / Trust)
- **Backend:** Supabase (Postgres 17) + Edge Functions (Deno/TypeScript)
- **Token:** TOKABU on Solana — mint `H8xQ6poBjB9DTPMDTKWzWPrnxu4bDEhybxiouF8Ppump`

---

## Local Development

```bash
npm install            # install dependencies
npm run dev            # start Vite dev server (HMR, http://localhost:5173)
npm test               # run Vitest unit suite
npm run lint           # run ESLint
npm run build          # production build (output: dist/)
npm run preview        # preview the production build locally
```

### Environment Variables

Create `.env.local` (Vite picks up `VITE_*` keys at build time):

```env
VITE_SUPABASE_URL=https://cldjwajhcepyzvmwjcmz.supabase.co
VITE_SUPABASE_ANON_KEY=<the project's publishable anon key>
VITE_HELIUS_API_KEY=<domain-restricted public key, optional>
VITE_WALLETCONNECT_PROJECT_ID=<optional>
```

See `docs/INTEGRATION.md` for the full env map (this repo + landing repo + Edge Function secrets + CI).

---

## Documentation

| Doc | Purpose |
|---|---|
| [`docs/PROJECT_DOCS.md`](docs/PROJECT_DOCS.md) | Detailed architecture: store, components, schema, Edge Functions, RLS |
| [`docs/PLAN.md`](docs/PLAN.md) | Roadmap and remaining priorities |
| [`docs/TASK.md`](docs/TASK.md) | Per-PR task log (most recent first) |
| [`docs/INTEGRATION.md`](docs/INTEGRATION.md) | Cross-repo contract: how the racing game and the landing page meet at Supabase |
| [`CLAUDE.md`](CLAUDE.md) | Project rules for AI-assisted development (Turkish) |

---

## CI / CD

Three GitHub Actions workflows guard `main`:

| Workflow | Trigger | What it does |
|---|---|---|
| `.github/workflows/ci.yml` | every PR | `npm test` + `npm run build` + `npm run lint` (must all pass) |
| `.github/workflows/deploy-edge-functions.yml` | push to main touching `supabase/functions/**` | deploys 4 Edge Functions via Supabase CLI |
| `.github/workflows/deploy-migrations.yml` | push to main touching `supabase/migrations/**` | runs `supabase db push` (idempotent, repairs first-run state) |

Branch protection requires PR review + status checks before merge.

---

## License

Private. Contact: [@lumexia_project on X](https://x.com/lumexia_project).
