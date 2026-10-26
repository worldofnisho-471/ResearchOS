# ResearchOS

From research idea to validated result, for the whole team.

ResearchOS checks a research idea against real papers, turns it into a plan with measurable goals, tracks results on a live dashboard, and suggests what to change next. A Lead approves every AI change. Low-scoring ideas get related directions built from the team's ORCID publications, with paper, funding and market signals.

**Stack:** React + Vite (plain JavaScript) on Vercel · Supabase for the database, sign-in, row-level security, live updates and one edge function · Gemini (free tier) or Claude for the AI.

---

## Set it up (about 20 minutes, all free tiers)

### 1. Supabase: database

1. Create a project at [supabase.com](https://supabase.com) (free plan).
2. Open **SQL Editor → New query**, paste all of [`supabase/schema.sql`](supabase/schema.sql), and click **Run**. It is safe to run again later.
3. **Authentication → Sign In / Providers → Email**: for a buildathon demo, turn **Confirm email** off so new accounts can sign in straight away. Leave it on for real users.
4. **Authentication → URL Configuration**: set **Site URL** to your Vercel URL once you have it (step 4), and add it under **Redirect URLs**.

### 2. Supabase: the AI function

1. **Edge Functions → Deploy a new function → Via editor**. Name it exactly `ai`.
2. Replace the sample code with all of [`supabase/functions/ai/index.ts`](supabase/functions/ai/index.ts) and click **Deploy**.
3. **Edge Functions → Secrets**, add:

| Secret | Value |
|---|---|
| `LLM_PROVIDER` | `gemini` (free) or `anthropic` |
| `GEMINI_API_KEY` | from [aistudio.google.com](https://aistudio.google.com/apikey), if using Gemini |
| `GEMINI_MODEL` | optional, defaults to `gemini-3.8-flash` |
| `GEMINI_THINKING_LEVEL` | optional, defaults to `low` for speed; `medium`, `high` or `off` also work |
| `GEMINI_FALLBACK_MODEL` | optional, a second Gemini model to try when the main one is busy |
| `ANTHROPIC_API_KEY` | from [console.anthropic.com](https://console.anthropic.com), if using Claude |
| `ANTHROPIC_MODEL` | optional, defaults to `claude-sonnet-5-5` |
| `OPENALEX_API_KEY` | free from [openalex.org](https://openalex.org) — needed for ORCID import and paper trends |
| `SEMANTIC_SCHOLAR_API_KEY` | optional; without it the idea check falls back to OpenAlex when Semantic Scholar is busy |

Keys live only in Supabase secrets. Never put them in the frontend or in Git.

### 3. Get your public keys

**Project Settings → API** (or the **Connect** button): copy the **Project URL** and the **anon / publishable** key. These two are safe in the browser because row-level security protects the data. **Never use the service-role key in this app.**

### 4. Vercel: the website

1. Put this folder in a GitHub repo (or upload it with **Add file → Upload files** on github.com).
2. At [vercel.com](https://vercel.com) → **Add New → Project** → import the repo. Vercel detects Vite.
3. Add environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` with the values from step 3.
4. **Deploy.** Then put the Vercel URL into Supabase's URL Configuration (step 1.4).

### 5. Demo login for judges

Sign up on the live site with a demo email and password, then click **Open an example project** so judges land on a project with real data in every screen. Share that email and password in your submission.

### Run locally

```bash
cp .env.example .env.local   # fill in the two values
npm install
npm run dev
```

---

## How it works

| Screen | What happens |
|---|---|
| **1 Idea check** | Semantic Scholar returns real papers (OpenAlex if it is busy or finds none); the AI scores viability using only those papers and lists the commercial assumptions behind its score. Below 50, related directions run automatically. |
| **2 Research plan** | AI-generated milestones and tasks with measurable success criteria. Drag cards (long-press on phones), search and filter, assign, set due dates, comment. |
| **3 Log results** | Record what happened and whether the criterion was met. |
| **4 Dashboard** | Tasks by status, goal results, progress per milestone, what needs attention, workload. |
| **5 Next steps** | The AI reads results, notes and protocols, then proposes task edits and new tasks. A Lead approves each one. |
| **Notes** | Shared lab notebook: protocols, observations, decisions, reading notes, with search and highlights. |
| **Team** | Email invites with roles, live presence, activity feed, ORCID publication import. |

**Related directions** (below 50): imports each member's public works from ORCID via OpenAlex → AI proposes adjacent directions → checks each with OpenAlex paper counts per year, NIH RePORTER funding, and web search for market signals (every signal keeps its source link) → ranks them on fit, momentum, commercial pull, room and feasibility.

**Roles** are enforced in the database with row-level security, not just hidden in the UI:

- **Lead**: everything, including approving AI changes, inviting people and deleting the project.
- **Researcher**: edit the plan, results, notes and evidence; run reviews and directions.
- **Observer**: read everything and comment.

## Files

```
index.html, vite.config.js, vercel.json, package.json
src/
  App.jsx            sign-in gate and hash router
  lib/               Supabase client, project data + live updates, helpers
  pages/             sign-in, projects home, invite, profile, project shell
  tabs/              Idea, Plan, Results, Dashboard, Next, Notes, Team
  components/        task sheet, related directions, commercial case, UI bits
supabase/
  schema.sql         tables, row-level security, triggers, example project
  functions/ai/      the one edge function for every AI and outside-data call
```

## How AI steps run

Every AI step (idea check, plan, review, related directions, ORCID import, re-score) runs as a **background job**. The `ai` function records the job in the `ai_jobs` table, replies straight away, and keeps working; the app watches the job, shows its progress, and refreshes the screen when it's done. Jobs survive tab switches and page reloads, teammates see them running, and a job that times out because the AI was busy is retried once automatically. Plans are written in small parallel calls (milestones first, then each milestone's tasks) so no single AI call runs long.

## Troubleshooting

- **"The AI function is out of date"** or **"The ai_jobs table is missing"**: paste the latest `index.ts` into the `ai` function and re-run `schema.sql`.
- **"Couldn't reach the AI function"**: the function must be named `ai` and deployed; check its logs in Supabase.
- **"GEMINI_API_KEY is not set"** or similar: add the secret, then redeploy the function.
- **ORCID import finds nothing**: check `OPENALEX_API_KEY` is set and the ORCID record has public works.
- **Changes from teammates don't appear live**: re-run `schema.sql` (it adds the tables to Supabase Realtime). A page refresh always shows the latest data.
- **Invite says it was sent to another email**: invitees must sign in with the exact address the Lead entered.
