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
