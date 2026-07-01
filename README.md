# Hummingbird

Authentication and role-based company access foundation.

## Run locally

```bash
npm start
```

Open `http://localhost:3000`.

If writes fail with `attempt to write a readonly database`, stop duplicate server/watch processes and restart cleanly:

```bash
npm run restart
```

Before resetting the database, always use:

```bash
npm run db:reset
```

The reset script stops running Hummingbird server processes before recreating SQLite.

## Accounts

Demo logins and seeded sample workspaces have been removed. Use `/signup` to create a real company workspace, or configure the Developer account below for platform administration.

## Included foundation

- Login screen with invalid credential and inactive-user states
- SQLite database with `users`, `companies`, `roles`, and `user_company_access`
- Seeded default roles
- Company access validation
- Workspace switcher for users with multiple companies
- Temporary dashboard with user, company, and role
- Session storage of selected company and role
- Company Profile onboarding form at `/company-profile`
- Required company profile validation
- Role-based profile editing:
  - Can edit: Developer, Super Admin, Business Owner, Marketing Manager
  - View only: Read-Only Analyst
- Premium SaaS app shell with sidebar navigation, header workspace switcher, dashboard cards, and coming-soon module pages
- Session caching for selected company/role/profile snapshot and workspace list
- Database indexes for email and company access lookups
- Company onboarding completion with status timestamp
- Lightweight onboarding requiring only Company Name and Website URL
- Dashboard setup progress for Company Name, Website URL, and optional Logo URL
- Business Snapshot card for company context
- Signup and workspace creation at `/signup`
- New signup users become Business Owner of their own company workspace
- Company user management at `/users`
- Workspace-scoped add, edit, deactivate, and remove access controls
- Developer-only platform admin at `/developer`
- Developer mode can manage platform companies, users, and workspace access
- Gemini Business Profile Analysis at `/business-analysis`
- Real business analysis job records, completion/failure states, and run history stored in `business_analyses`
- Gemini-generated business fields are saved back into the company profile for later editing
- Platform-owned Gemini key loaded from `.env`
- Structured JSON analysis validation before saving
- GEO Visibility powered by Google Search Console OAuth
- Search Console country/query/page rows saved in SQLite before rendering dashboard heatmaps and tables

## Developer setup

To seed the private Developer user, set `HUMMINGBIRD_DEVELOPER_PASSWORD` before starting or resetting the app:

```bash
export HUMMINGBIRD_SESSION_SECRET="use-a-long-random-session-secret"
export HUMMINGBIRD_DEVELOPER_PASSWORD="use-a-secure-password"
npm start
```

If no Developer exists and this env variable is missing, Hummingbird logs a setup warning and does not create a silent default password. The older `RANGO_DEVELOPER_PASSWORD` variable is still accepted as a fallback for existing local setups.

For Vercel, always set `HUMMINGBIRD_SESSION_SECRET` so signed login cookies remain valid across serverless function invocations.

For local development, `.env` is loaded automatically and is ignored by git.

## Gemini setup

Business Analysis uses the platform Gemini key from `.env`:

```bash
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash
GEMINI_TIMEOUT=60000
GEMINI_RETRY_ATTEMPTS=3
```

If `GEMINI_API_KEY` is missing, Hummingbird saves a failed analysis record with a safe error message instead of crashing.

## Google Search Console GEO setup

GEO Visibility uses the user’s Google account to read verified Search Console properties. Set these variables locally and in Vercel:

```bash
GOOGLE_CLIENT_ID=your_google_oauth_client_id
GOOGLE_CLIENT_SECRET=your_google_oauth_client_secret
GOOGLE_REDIRECT_URI=https://your-domain.vercel.app/api/google/callback
GOOGLE_TOKEN_ENCRYPTION_KEY=use-a-long-random-secret-for-token-encryption
```

Required Google scope:

```text
https://www.googleapis.com/auth/webmasters.readonly
```

In Google Cloud Console:

1. Create/select a Google Cloud project.
2. Enable the Google Search Console API.
3. Configure OAuth consent screen.
4. Create OAuth Client ID as a Web application.
5. Add authorized redirect URI: `https://your-domain.vercel.app/api/google/callback`.
6. Add local redirect URI if needed: `http://localhost:3000/api/google/callback`.
7. Make sure the connecting Google account has access to the website inside Google Search Console.

In Hummingbird, open GEO Visibility, connect Google Search Console, select the verified property, then sync. The app stores Search Console rows in the database and renders the GEO tab from saved data.

## Daily refresh automation

Hummingbird includes a Vercel Cron job that calls `/api/cron/daily-refresh` every day at `02:00 UTC`.

Set this environment variable in Vercel:

```bash
CRON_SECRET=use-a-long-random-secret
```

The daily refresh:

- refreshes Google Search Console rows for connected workspaces;
- reruns saved prompt visibility checks for workspaces with analysis, competitors, and prompts;
- saves the latest database data so dashboards show fresh comparisons without manual effort.

Only real saved provider data is used. If ChatGPT, Claude, or Perplexity APIs are not connected yet, those providers stay excluded from combined Hummingbird AI scoring instead of being mocked.

## Vercel database seed

For the current prototype, `data/rango.sqlite` is intentionally committed as a bundled seed database so Vercel can start with the same users, companies, prompts, analyses, and access records that exist locally.

On Vercel, the runtime database is copied from this seed into `/tmp/rango.sqlite` when the serverless function starts and no runtime database exists yet.

### Optional production owner seed

Because Vercel `/tmp` storage is ephemeral, set these environment variables if you need one client owner account/workspace to be recreated automatically after a cold start or redeploy:

```bash
HUMMINGBIRD_SEED_OWNER_EMAIL=owner@example.com
HUMMINGBIRD_SEED_OWNER_PASSWORD=use-a-secure-password
HUMMINGBIRD_SEED_OWNER_NAME=Owner Name
HUMMINGBIRD_SEED_COMPANY_NAME=Company Name
HUMMINGBIRD_SEED_COMPANY_URL=https://example.com
HUMMINGBIRD_SEED_COMPANY_LOGO=https://example.com/logo.png
```

This is a temporary prototype safety net, not a replacement for a real hosted production database.

Important: Vercel `/tmp` storage is ephemeral. New production signups or generated data can disappear after cold starts/redeploys. Move to a hosted database such as Neon, Supabase, Turso, or Postgres before production launch.
