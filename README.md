# Reline

A self-hosted, Linear-style issue tracker for small teams. Kanban board, cycles
(sprints), labels, notifications, keyboard-first UX, and a one-time Jira
import — free to run on Render + Neon.

The repo is an npm workspaces monorepo:

- **`apps/web`** — Next.js UI (no database access)
- **`apps/api`** — Hono API (Postgres, Better Auth, R2)
- **`packages/shared`** — shared types, constants, and pure helpers

The browser only talks to the web origin. Next.js rewrites `/api/*` to the API
so auth cookies stay first-party.

## Stack

- **Next.js** (App Router) + TypeScript
- **Hono** API on Node
- **Tailwind CSS + shadcn/ui** — Linear-inspired dark UI
- **Better Auth** — email & password + Google OAuth
- **Neon Postgres** + **Drizzle ORM**
- **@dnd-kit** — drag & drop kanban

## Features

- Issues with priorities, statuses, assignees, labels, estimates
- Image & video attachments on issues and comments (Cloudflare R2)
- Kanban board (drag between columns) and grouped list views
- Cycles: create, start, complete — unfinished issues return to the pool
- Inbox notifications (assigned / commented / status changed) with unread badge
- Command palette (⌘K) and shortcuts (`C` to create an issue)
- Workspace invites via link
- One-time Jira import: CSV export or Jira Cloud REST API
- Read-only Cursor MCP: paste an issue link and Cursor can read the
  description and attachments

## Local development

```bash
npm install

# Start a local Postgres (or point DATABASE_URL at Neon)
docker run -d --name reline-pg \
  -e POSTGRES_USER=reline -e POSTGRES_PASSWORD=reline -e POSTGRES_DB=reline \
  -p 5433:5432 postgres:16-alpine

cp apps/api/.env.example apps/api/.env
# fill in values (defaults work with the docker command above)

npm run db:migrate
npm run dev
```

This starts the API on http://localhost:4001 and the web app on
http://localhost:4002. Open the web URL, sign up, and create your workspace.
Invite your teammate from Settings → Members.

`npm run dev` runs both apps. You can also start them separately:

```bash
npm run dev -w @reline/api
npm run dev -w @reline/web
```

### Google login (optional)

1. In [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials),
   create an **OAuth 2.0 Client ID** (Web application).
2. Add authorized redirect URI:
   `{BETTER_AUTH_URL}/api/auth/callback/google`
   (e.g. `http://localhost:4002/api/auth/callback/google` in local dev).
3. Put the values in `apps/api/.env`:

```bash
GOOGLE_CLIENT_ID=....apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=....
```

4. Restart the dev servers. Login/signup will show **Continue with Google**.

### Attachments (Cloudflare R2)

Issues and comments support image (jpeg/png/gif/webp/avif, ≤10 MB) and video
(mp4/webm/mov, ≤100 MB) attachments, stored in Cloudflare R2. Files upload
through the API in local/dev (avoids browser CORS) or via presigned URLs.

1. In the [Cloudflare dashboard](https://dash.cloudflare.com), go to **R2**
   and create a bucket (e.g. `reline`).
2. Add a CORS policy to the bucket (Settings → CORS policy) so the browser
   can PUT to it if you use presigned uploads:

```json
[
  {
    "AllowedOrigins": ["http://localhost:4002", "https://<your-web-domain>"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["content-type"],
    "MaxAgeSeconds": 3600
  }
]
```

3. Enable public access (Settings → Public access → allow the R2.dev
   subdomain, or connect a custom domain) and note the public URL.
4. Create an API token under **R2 → Manage R2 API Tokens** with
   **Object Read & Write** scoped to the bucket.
5. Fill in `apps/api/.env`:

```bash
R2_ACCOUNT_ID=          # from the dashboard URL / R2 overview
R2_ACCESS_KEY_ID=       # from the API token
R2_SECRET_ACCESS_KEY=   # from the API token
R2_BUCKET_NAME=reline
R2_PUBLIC_URL=https://pub-xxxxxxxx.r2.dev
```

If the R2 vars are unset the app still runs — attachment uploads just fail
with a clear error.

### Analytics and error tracking (PostHog)

[PostHog](https://posthog.com) records product analytics and exceptions. Leave
the tokens unset and the app runs without sending anything.

1. Create a PostHog project and copy the project token from Project Settings.
2. `cp apps/web/.env.example apps/web/.env.local`:

```bash
NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN=phc_...
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

Use `https://eu.i.posthog.com` for EU Cloud. The host is read at build time.

The browser sends events to `/ingest` on the web origin, and Next.js forwards
them to PostHog. Page views, autocaptured clicks, and unhandled browser
exceptions are captured. Signed-in users are identified by their user id, with
email and name stored as person properties. The open workspace is sent as a
`workspace` group. Signing out resets the browser identity. Next.js server
errors in the web app are reported on the same person. The API does not send
events.

For readable production stack traces, set these on the web service before the
build. The personal API key needs error-tracking write access, and the
environment id is under PostHog Settings → Environment:

```bash
POSTHOG_PERSONAL_API_KEY=phx_...
POSTHOG_ENV_ID=
```

Source maps upload only when both are set.

## Deploy (Render + Neon)

1. **Neon**: create a project at [console.neon.tech](https://console.neon.tech),
   copy the pooled connection string.
2. **Render**: push this repo to GitHub, then create a Blueprint from it
   (Render reads `render.yaml`). This creates two web services: `reline-api`
   and `reline-web`. Set the env vars when prompted:
   - `DATABASE_URL` — your Neon connection string (API)
   - `BETTER_AUTH_URL` — `https://<reline-web>.onrender.com` (the public web URL)
   - `BETTER_AUTH_SECRET` / `BETTER_AUTH_API_KEY` are generated automatically
   - `API_INTERNAL_URL` on the web service is wired to the API's private host
   - Optional Google (API only): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
     and add `https://<reline-web>.onrender.com/api/auth/callback/google` in Google Cloud
   - Attachments: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
     `R2_BUCKET_NAME`, `R2_PUBLIC_URL` (see the R2 section above), and add your
     web URL to the bucket's CORS policy
   - PostHog (optional, web service only): `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`
     and `NEXT_PUBLIC_POSTHOG_HOST` (the public host is baked in at build time).
     For unminified stack traces, also set `POSTHOG_PERSONAL_API_KEY` and
     `POSTHOG_ENV_ID` before the build
3. Deploy. Migrations run as the API pre-deploy command. The API binds to
   `0.0.0.0:$PORT` and health-checks at `/api/health`; the web app health-checks
   at `/health`.

Note: free Render services spin down after 15 minutes of inactivity — the
first request after that takes a few seconds.

## Cursor MCP

Settings → Cursor creates a **read-only** personal token. The token can read
issues in workspaces you belong to. It cannot create, edit, or delete anything.

In Cursor, add a remote MCP server (or paste this into `~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "reline": {
      "url": "https://<your-web-app>/api/mcp",
      "headers": {
        "Authorization": "Bearer rel_…"
      }
    }
  }
}
```

Locally, with `npm run dev`, use `http://localhost:4002/api/mcp` (or
`http://localhost:4001/api/mcp` to hit the API directly). Use the web app
origin in production. Next.js forwards `/api/mcp` to the API. Then paste an
issue link such as `https://<your-web-app>/acme/issue/REL-42` in chat. Cursor
calls `get_issue` for the title, description, comments, and attachments, and
`get_attachment` to refetch one file. Images are returned inline. Videos stay
as URLs.

The secret is shown once and only its hash is stored. Revoke it from the same
settings page if it leaks. There is no OAuth on this endpoint, so Cursor uses
the bearer token you configure.

## Importing from Jira

Settings → Import:

- **CSV** — in Jira, run a project search and Export → CSV (all fields), then
  upload it.
- **Jira Cloud API** — paste your site URL, project key, Atlassian email, and
  an [API token](https://id.atlassian.com/manage-profile/security/api-tokens).
  The token is used once and never stored.

Statuses map to Backlog/Todo/In Progress/Done/Canceled by name, priorities map
to Urgent/High/Medium/Low, labels are created on the fly, and assignees are
matched by email or display name (unmatched ones import as unassigned). Sprints
become cycles (numbered after any cycles you already have); each issue is
placed in its current/latest sprint.
