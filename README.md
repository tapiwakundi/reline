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
- Image & video attachments on issues and comments (Cloudflare R2)
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

### Attachments (Cloudflare R2)

Issues and comments support image (jpeg/png/gif/webp/avif, ≤10 MB) and video
(mp4/webm/mov, ≤100 MB) attachments, stored in Cloudflare R2. Files upload
straight from the browser via presigned URLs, so they never pass through the
app server.

1. In the [Cloudflare dashboard](https://dash.cloudflare.com), go to **R2**
   and create a bucket (e.g. `reline`).
2. Add a CORS policy to the bucket (Settings → CORS policy) so the browser
   can PUT to it:

```json
[
  {
    "AllowedOrigins": ["http://localhost:3100", "https://<your-app-domain>"],
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
5. Fill in `.env`:

```bash
R2_ACCOUNT_ID=          # from the dashboard URL / R2 overview
R2_ACCESS_KEY_ID=       # from the API token
R2_SECRET_ACCESS_KEY=   # from the API token
R2_BUCKET_NAME=reline
R2_PUBLIC_URL=https://pub-xxxxxxxx.r2.dev
```

If the R2 vars are unset the app still runs — attachment uploads just fail
with a clear error.

## Deploy (Render + Neon)

1. **Neon**: create a project at [console.neon.tech](https://console.neon.tech),
   copy the pooled connection string.
2. **Render**: push this repo to GitHub, then create a Blueprint from it
   (Render reads `render.yaml`). Set the env vars when prompted:
   - `DATABASE_URL` — your Neon connection string
   - `BETTER_AUTH_URL` / `NEXT_PUBLIC_APP_URL` — `https://<your-service>.onrender.com`
   - `BETTER_AUTH_API_KEY` is generated automatically
   - Optional Google: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
     `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (same as client id), and add
     `https://<your-service>.onrender.com/api/auth/callback/google` in Google Cloud
   - Attachments: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
     `R2_BUCKET_NAME`, `R2_PUBLIC_URL` (see the R2 section above), and add your
     Render URL to the bucket's CORS policy
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
matched by email or display name (unmatched ones import as unassigned). Sprints
become cycles (numbered after any cycles you already have); each issue is
placed in its current/latest sprint.
