# Reline

A self-hosted, Linear-style issue tracker for small teams. Kanban board, cycles
(sprints), labels, notifications, keyboard-first UX, and a one-time Jira
import — free to run on Render + Neon.

## Stack

- **Next.js** (App Router) + TypeScript
- **Tailwind CSS + shadcn/ui** — Linear-inspired dark UI
- **Better Auth** — email & password + Google OAuth
- **Neon Postgres** + **Drizzle ORM**
- **@dnd-kit** — drag & drop kanban

## Features

- Issues with priorities, statuses, assignees, labels, estimates
- Kanban board (drag between columns) and grouped list views
- Cycles: create, start, complete — unfinished issues return to the pool
- Inbox notifications (assigned / commented / status changed) with unread badge
- Command palette (⌘K) and shortcuts (`C` to create an issue)
- Workspace invites via link
- One-time Jira import: CSV export or Jira Cloud REST API

## Local development

```bash
npm install

# Start a local Postgres (or point DATABASE_URL at Neon)
docker run -d --name reline-pg \
  -e POSTGRES_USER=reline -e POSTGRES_PASSWORD=reline -e POSTGRES_DB=reline \
  -p 5433:5432 postgres:16-alpine

cp .env.example .env   # fill in values (defaults work with the docker command above)
npx drizzle-kit migrate
npm run dev
```

Open http://localhost:3000, sign up, and create your workspace. Invite your
teammate from Settings → Members.

### Google login (optional)

1. In [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials),
   create an **OAuth 2.0 Client ID** (Web application).
2. Add authorized redirect URI:
   `{BETTER_AUTH_URL}/api/auth/callback/google`
   (e.g. `http://localhost:3100/api/auth/callback/google` in local dev).
3. Put the values in `.env`:

```bash
GOOGLE_CLIENT_ID=....apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=....
NEXT_PUBLIC_GOOGLE_CLIENT_ID=....apps.googleusercontent.com  # same as GOOGLE_CLIENT_ID
```

4. Restart the dev server. Login/signup will show **Continue with Google**.

## Deploy (Render + Neon)

1. **Neon**: create a project at [console.neon.tech](https://console.neon.tech),
   copy the pooled connection string.
2. **Render**: push this repo to GitHub, then create a Blueprint from it
   (Render reads `render.yaml`). Set the env vars when prompted:
   - `DATABASE_URL` — your Neon connection string
   - `BETTER_AUTH_URL` / `NEXT_PUBLIC_APP_URL` — `https://<your-service>.onrender.com`
   - `BETTER_AUTH_SECRET` is generated automatically
   - Optional Google: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
     `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (same as client id), and add
     `https://<your-service>.onrender.com/api/auth/callback/google` in Google Cloud
3. Deploy. Migrations run during build; the app binds to `0.0.0.0:$PORT` and
   health-checks at `/api/health`.

Note: free Render services spin down after 15 minutes of inactivity — the
first request after that takes a few seconds.

## Importing from Jira

Settings → Import:

- **CSV** — in Jira, run a project search and Export → CSV (all fields), then
  upload it.
- **Jira Cloud API** — paste your site URL, project key, Atlassian email, and
  an [API token](https://id.atlassian.com/manage-profile/security/api-tokens).
  The token is used once and never stored.

Statuses map to Backlog/Todo/In Progress/Done/Canceled by name, priorities map
to Urgent/High/Medium/Low, labels are created on the fly, and assignees are
matched by email or display name (unmatched ones import as unassigned).
