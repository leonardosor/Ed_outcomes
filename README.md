# Milestone 2 — Education Outcomes Analytics

Two independent stacks, one repo. Each folder is self-contained and deploys on its own.

```
convex-vercel/        # Next.js 15 + Convex, deployed on Vercel  (current)
postgres-streamlit/   # Postgres/PostGIS + Streamlit + dbt + Docker ETL  (legacy)
```

## convex-vercel — run

```bash
cd convex-vercel
npm install
npx convex dev        # terminal 1 — Convex backend, hot reload
npm run dev           # terminal 2 — Next.js on http://localhost:3000
```

Copy `.env.local.example` to `.env.local` and fill in the values.

Load data (pre-exported NDJSON in `scripts/convex_export/`):

```bash
npx convex import --table districts    scripts/convex_export/districts.jsonl
npx convex import --table county_stats scripts/convex_export/county_stats.jsonl
npx convex import --table state_stats  scripts/convex_export/state_stats.jsonl
```

## convex-vercel — environment variables

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_CONVEX_URL` | yes | Convex deployment URL (inlined at build — redeploy after changing) |
| `BEDROCK_ACCESS_KEY_ID` | yes, for AI | AWS key for Claude in Amazon Bedrock |
| `BEDROCK_SECRET_ACCESS_KEY` | yes, for AI | AWS secret for Claude in Amazon Bedrock |
| `BEDROCK_REGION` | no | Default `us-east-1` |
| `BEDROCK_SESSION_TOKEN` | no | Temporary (STS) credentials only |
| `BEDROCK_MODEL` | no | Default `anthropic.claude-haiku-4-5` |
| `LLM_DAILY_BUDGET_USD`, `LLM_SESSION_TOKEN_CAP`, `LLM_MAX_SESSIONS_PER_DAY` | no | AI usage caps |
| `LLM_INPUT_USD_PER_MTOK`, `LLM_OUTPUT_USD_PER_MTOK` | no | Prices used for the daily budget |

## convex-vercel — deploy

```bash
npx convex deploy                 # push Convex functions/schema to prod deployment
vercel                            # preview deploy
vercel --prod                     # production deploy
vercel env add NEXT_PUBLIC_CONVEX_URL production
vercel env pull .env.local        # sync cloud env vars to local
```

Vercel dashboard: set **Root Directory** to `convex-vercel`. Convex prod URL goes in `NEXT_PUBLIC_CONVEX_URL`.

Other useful: `npx convex dashboard`, `npx convex logs`, `npx convex codegen`, `npx convex env list`, `vercel ls`, `vercel logs <url>`.

## postgres-streamlit — run

```bash
cd postgres-streamlit
cp .env.example .env              # fill in DB credentials
docker-compose -f docker-compose.prod.yml up --build
# Streamlit http://localhost:8501  |  Postgres localhost:5432
```

ETL / dbt (inside containers):

```bash
docker exec milestone2-etl python /app/src/main.py               # full pipeline
docker exec milestone2-etl ./entrypoint.sh census|urban|location  # single source
docker exec milestone2-etl ./entrypoint.sh dbt-run|dbt-test       # transforms
docker exec -it milestone2-db psql -U postgres -d milestone2      # SQL shell
```

## postgres-streamlit — deploy

- **Railway**: `railway.json` + `Procfile` at stack root; set service root to `postgres-streamlit`, attach Postgres plugin, set `DB_*` env vars. Guide: `docs/RAILWAY_DEPLOYMENT.md`.
- **Streamlit Cloud**: main file `postgres-streamlit/app/Home.py`; secrets in dashboard. Guide: `docs/STREAMLIT_CLOUD_SETUP.md`.

Full command reference: `postgres-streamlit/CLAUDE.md`.

## Shared analytics assets

`notebooks/`, `supervised/`, `unsupervised/`, `src/`, `db_backup/` are duplicated into both stacks so each stands alone.
