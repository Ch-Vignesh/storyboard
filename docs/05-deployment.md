# Deployment

How Storyboard gets from a laptop to the public internet, and what has to be
true before it should. Written to be followed once, in order, by somebody who
has not deployed it before.

Phase 8 in `04-phase-plan.md` is this document being carried out. Almost none of
it is code; most of it is opening accounts and copying values between them.

---

## What you need

| Service           | Plan needed                    | What it is for                               |
| ----------------- | ------------------------------ | -------------------------------------------- |
| **Neon**          | any, including free            | Postgres 16, backups, preview databases      |
| **Vercel**        | **Pro** — see _Scheduled work_ | Two projects: the app and the marketing site |
| **Cloudflare R2** | free tier is enough            | Uploaded manuscripts                         |
| **Resend**        | free tier is enough            | Every email the product sends                |
| **A domain**      | —                              | The sending domain has to be one you own     |

The Vercel Hobby plan allows **two** scheduled jobs, each at most once a day.
This product has six, one of them every ten minutes. On Hobby, four jobs will
not run and the digests will not arrive. Either use Pro, or move the schedule to
something else that can issue an authenticated request — the endpoint does not
care who calls it (see _Scheduled work_).

---

## The order

Each step produces a value the next one needs, so this order is not arbitrary.

1. Neon, and run the migrations.
2. R2, including its CORS rule.
3. Resend, and verify the domain — DNS takes the longest, so start it early.
4. The two Vercel projects, with the values from 1–3.
5. Scheduled work.
6. Seed, then the restore drill.

---

## 1. Neon

Create a project on **Postgres 16** in the region nearest your Vercel
deployment. Two settings matter, both under the project's settings:

- **Point-in-time restore: 30 days.** NFR-8 asks for a 30-day recovery window,
  and this is where that claim comes from.
- **Branch previews**, if you want a database per preview deployment. Optional,
  and the reason a Neon branch exists at all.

Neon gives you two connection strings. You need both, and they are not
interchangeable:

| Neon calls it | Goes in               | Why                                                             |
| ------------- | --------------------- | --------------------------------------------------------------- |
| Pooled        | `DATABASE_URL`        | The application. Serverless opens many short connections.       |
| Direct        | `DIRECT_DATABASE_URL` | Migrations only. DDL cannot run over a transaction-mode pooler. |

Getting these the wrong way round produces a migration that hangs on an
advisory lock, or half-applies. `packages/db/prisma.config.ts` prefers
`DIRECT_DATABASE_URL` for exactly this reason; the application never reads it.

Then, from a laptop with both values in the root `.env`:

```sh
pnpm db:deploy      # applies every migration, including the invariant SQL
pnpm db:seed        # idempotent: safe on every deploy, and on an existing database
```

`db:deploy` is the only thing that should ever create tables. Never
`prisma db push` — the triggers and partial indexes live in migration files and
`db push` does not run them, so you would get a database that accepts writes the
product's invariants forbid.

---

## 2. Cloudflare R2

One bucket, private, in a region near the app. Create an **API token** scoped to
that bucket with read and write.

```
R2_ACCOUNT_ID=…          # Cloudflare account id, not the bucket id
R2_ACCESS_KEY_ID=…
R2_SECRET_ACCESS_KEY=…
R2_BUCKET=…              # the bucket name
```

All four or none. With none, uploads are written to `.uploads/` on the
application server, which is a supported way to self-host on a box with a real
disk and is **not** viable on Vercel: each instance gets its own temporary
filesystem, so the parser would go looking for a file on a machine that no
longer exists. The startup preflight refuses to boot in that combination rather
than let you find out from a user.

### The CORS rule, which is not optional

The browser uploads straight to R2 with a presigned PUT, so R2 has to allow your
app's origin. Without this the upload fails with a CORS error that says nothing
useful about the cause. In the bucket's **Settings → CORS policy**:

```json
[
  {
    "AllowedOrigins": ["https://app.your-domain"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedHeaders": ["content-type"],
    "ExposeHeaders": ["etag"],
    "MaxAgeSeconds": 3600
  }
]
```

`AllowedOrigins` is the **application's** origin, not the bucket's. Add the
preview origin too if you want imports to work on preview deployments.

---

## 3. Resend

Add your domain and publish the DNS records it gives you — SPF, DKIM, and a
DMARC record. Wait for it to verify; this is the step with a delay measured in
hours rather than minutes, which is why it is third rather than last.

```
RESEND_API_KEY=re_…
EMAIL_FROM="Storyboard <hello@your-domain>"
```

`EMAIL_FROM` must be on the domain you verified. The preflight rejects the
`example.com` placeholder, because a sender on an unverified domain means every
message is either rejected or filed as spam, and nothing in the application will
tell you that is happening.

Until a key is set the console mailer prints each message to stdout. That is
correct on a laptop and useless in production, which is why a publicly reachable
deployment refuses to start without one: otherwise sign-up appears to work and
every new account is stranded waiting for a verification link that went to a log.

---

## 4. The two Vercel projects

Both are created from the same repository, and differ only in root directory.

|                 | Application        | Marketing site     |
| --------------- | ------------------ | ------------------ |
| Root directory  | `apps/app`         | `apps/web`         |
| Framework       | Next.js            | Next.js            |
| Build / install | from `vercel.json` | from `vercel.json` |
| Domain          | `app.your-domain`  | `your-domain`      |

Each app has a `vercel.json` that sets the build to run through Turborepo from
the root of the workspace, so the shared packages are built first. Leave
Vercel's own build settings on their defaults and let the file win.

### Environment variables

Set these in **Settings → Environment Variables**. The application needs all of
them; the marketing site needs only the two public URLs.

| Variable                    | App | Web | Notes                                             |
| --------------------------- | :-: | :-: | ------------------------------------------------- |
| `DATABASE_URL`              |  ●  |     | Neon **pooled**                                   |
| `DIRECT_DATABASE_URL`       |  ○  |     | Neon **direct**. Only needed where migrations run |
| `AUTH_SECRET`               |  ●  |     | `openssl rand -base64 32`                         |
| `AUTH_URL`                  |  ●  |     | `https://app.your-domain`                         |
| `AUTH_TRUST_HOST`           |  ●  |     | `true`                                            |
| `EMAIL_FROM`                |  ●  |     | On the verified domain                            |
| `RESEND_API_KEY`            |  ●  |     |                                                   |
| `CRON_SECRET`               |  ●  |     | `openssl rand -hex 32`                            |
| `R2_ACCOUNT_ID`             |  ●  |     | All four, or none                                 |
| `R2_ACCESS_KEY_ID`          |  ●  |     |                                                   |
| `R2_SECRET_ACCESS_KEY`      |  ●  |     |                                                   |
| `R2_BUCKET`                 |  ●  |     |                                                   |
| `NEXT_PUBLIC_APP_URL`       |  ●  |  ●  | `https://app.your-domain`                         |
| `NEXT_PUBLIC_MARKETING_URL` |  ●  |  ●  | `https://your-domain`                             |
| `LOG_LEVEL`                 |  ○  |  ○  | `info` is the default                             |

`NEXT_PUBLIC_*` values are compiled into the browser bundle at build time, not
read at runtime. Changing one requires a new deployment, not a restart — and
they are declared in `turbo.json`'s `globalEnv` so that changing one actually
invalidates the build cache instead of silently serving a build with the old URL
baked in.

### What the app refuses to start without

`apps/app/src/env-preflight.ts` runs at startup. When `NEXT_PUBLIC_APP_URL` is
not a loopback address — that is, when strangers can reach this deployment — it
requires a mail key, a real sender, a cron secret, https URLs, and object
storage on a serverless host. It lists **every** problem at once rather than one
per attempt, and the message names the variable and what would silently happen
without it.

The check is keyed to the public URL rather than `NODE_ENV` deliberately:
`NODE_ENV` is `production` for `next build`, for `next start` on a laptop, and
for the Playwright suite, none of which have a Resend key or want one.

`ALLOW_INCOMPLETE_DEPLOYMENT=1` downgrades all of it to warnings, for a staging
box where none of it matters. It should never be set on the real thing.

---

## 5. Scheduled work

Six jobs, in `apps/app/vercel.json` (decision 0012):

| Job         | Schedule      | What it does                                  |
| ----------- | ------------- | --------------------------------------------- |
| `immediate` | every 10 min  | Decisions on your own work (FR-12.3)          |
| `hourly`    | hourly        | Everything that is not about your own work    |
| `weekly`    | Mondays 09:00 | The weekly digest                             |
| `nudge`     | daily 08:30   | The seven-day silence nudge (FR-12.4)         |
| `prune`     | daily 03:15   | Expired rate-limit rows                       |
| `purge`     | daily 03:45   | Storyboards past their 30-day deletion window |

Times are UTC. Vercel adds `Authorization: Bearer $CRON_SECRET` to scheduled
requests automatically when that variable is set on the project, which is what
`/api/cron/[job]` checks — with a constant-time comparison, so the secret cannot
be guessed a byte at a time.

The endpoint fails closed: no secret configured, no job runs, 503. That is the
right behaviour for a public URL that sends email, and it is silent, which is
why the preflight refuses to deploy without the secret rather than leaving you
to notice that no digest ever arrived.

Nothing about the endpoint is Vercel-specific. Any scheduler that can issue an
authenticated POST works:

```sh
curl -X POST https://app.your-domain/api/cron/hourly \
  -H "Authorization: Bearer $CRON_SECRET"
```

And locally, without HTTP at all: `pnpm cron hourly`.

---

## 6. Backups, and the drill

Neon's point-in-time restore is the backup (NFR-8). Enabling it is not the
requirement; **restoring from it is**. A backup nobody has restored is a hope.

```sh
pnpm db:drill "postgresql://…restored-branch…"
```

The drill checks four things against a database restored from a backup: that
every migration is applied and none is pending, that the invariants are really
there — the immutability trigger and both partial unique indexes, which are the
ones `db push` would have skipped — that the tables hold rows, and that a whole
storyboard can be read out of it, chapters and sections and revisions together.

Run it against a restored branch, never against production: it refuses to run if
the database looks like the live one by declining any URL that is also
`DATABASE_URL`.

Do this once before launch, and once a quarter after. Record the date in
`04-phase-plan.md`; an undated drill is indistinguishable from one that never
happened.

---

## 7. Before you tell anybody

```sh
pnpm check-excerpts                              # the seeded quotations still match their editions
PLAYWRIGHT_BASE_URL=https://app.your-domain pnpm e2e
```

The flows run against the deployed application. They sign up real accounts, so
point them at production once, deliberately, and expect the seeded data to gain
a few example users.

Then, by hand, the things no test can claim for you:

- Sign up from a phone, on a network that is not yours, and read the
  verification email in a real inbox. Check where it landed.
- Read a stuck passage, send a suggestion, accept it, and confirm the credit
  line appears — the loop the whole product exists for.
- A screen reader through the reader, the editor, and the request flow. The
  automated pass (`e2e/accessibility.spec.ts`) covers what a machine can check,
  which is roughly a third of WCAG 2.2 AA. Until somebody has listened to it,
  the product should not claim the rest.

---

## When something is wrong

| What you see                                      | Where to look                                                           |
| ------------------------------------------------- | ----------------------------------------------------------------------- |
| Deployment refuses to start, with a numbered list | It is the preflight. Each line names its variable                       |
| Sign-up email never arrives                       | Resend's log first; then whether `EMAIL_FROM` is on the verified domain |
| Uploads fail, console shows a CORS error          | The R2 CORS rule. `AllowedOrigins` is the app's origin                  |
| Import works, then the parse cannot find the file | R2 is not configured and instances do not share a disk                  |
| No digest ever arrives                            | `CRON_SECRET` set on the project? Vercel's cron log?                    |
| Migration hangs on an advisory lock               | It is running over the pooled URL. Use `DIRECT_DATABASE_URL`            |
| A build serves an old URL in the browser          | A `NEXT_PUBLIC_*` change needs a new deployment, not a restart          |
