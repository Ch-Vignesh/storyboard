# Deployment

How Storyboard gets from a laptop to the public internet, and what has to be
true before it should. Written to be followed once, in order, by somebody who
has not deployed it before.

Phase 8 in `04-phase-plan.md` is this document being carried out. Almost none of
it is code; most of it is opening accounts and copying values between them.

---

## What you need

| Service                  | Plan needed                                            | What it is for                                 |
| ------------------------ | ------------------------------------------------------ | ---------------------------------------------- |
| **Prisma Postgres**      | Free is enough with the nightly backup — see _Backups_ | Postgres, through Vercel's storage integration |
| **Vercel**               | Hobby is enough — see _Scheduled work_                 | Two projects: the app and the marketing site   |
| **Cloudflare R2**        | free tier is enough                                    | Uploaded manuscripts, and the backups          |
| **Resend**, or **Gmail** | free tier, or one Gmail account with an app password   | Every email the product sends                  |
| **A domain**             | — (Resend only)                                        | The sending domain has to be one you own       |

Vercel's Hobby plan runs a cron job at most once a day, and a deployment whose
`vercel.json` asks for more **fails**. This product has a job every ten
minutes, so the schedule lives in GitHub Actions instead and calls the same
endpoint (decision 0030). On Pro, it can move back into `vercel.json`.

---

## The order

Each step produces a value the next one needs, so this order is not arbitrary.

1. Prisma Postgres, and run the migrations.
2. R2, including its CORS rule.
3. Email: Resend with a verified domain — DNS takes the longest, so start it
   early — or SMTP through Gmail, which needs no DNS at all.
4. The two Vercel projects, with the values from 1–3.
5. Scheduled work.
6. Seed, then the restore drill.

---

## 1. Prisma Postgres

Decision 0028 covers why this is Prisma Postgres rather than Neon, and what
that costs. Create the database from the app's Vercel project, under
**Storage**, in the region nearest the project's functions. The integration
adds variables named with the prefix you chose, for example
`prisma_draftboard_POSTGRES_URL`. The application reads none of them by
name.

You need two connection strings. They share credentials and differ only in
the host, and they are not interchangeable:

| Host                  | Goes in               | Why                                                             |
| --------------------- | --------------------- | --------------------------------------------------------------- |
| `pooled.db.prisma.io` | `DATABASE_URL`        | The application. Serverless opens many short connections.       |
| `db.prisma.io`        | `DIRECT_DATABASE_URL` | Migrations only. DDL cannot run over a transaction-mode pooler. |

The integration gives you the `db.prisma.io` one — every variable it adds holds
that same string. The pooled one is that string with only the host changed;
both hosts accept the same login. If an integration offers a
`prisma+postgres://` URL instead, that is Prisma Accelerate, which this
application does not use, and it refuses to start with it.

Getting these the wrong way round produces a migration that hangs on an
advisory lock, or half-applies. `packages/db/prisma.config.ts` prefers
`DIRECT_DATABASE_URL` for exactly this reason; the application never reads it.

In the Vercel project, add `DATABASE_URL` by hand with the pooled string, for
**Production** only. A preview with the same value would write to the live
database, and there is no per-preview database to give it instead. So the app
does not build previews at all: `ignoreCommand` in `apps/app/vercel.json`
skips every deployment that is not Production, and a pull request shows the
app's check as skipped rather than failed. If the credentials are ever rotated
in Prisma, update this variable too: the integration only rotates its own.

Then, from a laptop with both values in the root `.env`:

```sh
pnpm db:deploy      # applies every migration, including the invariant SQL
pnpm db:seed        # idempotent: safe on every deploy, and on an existing database
```

`db:deploy` is the only thing that should ever create tables. Never
`prisma db push` — the triggers and partial indexes live in migration files and
`db push` does not run them, so you would get a database that accepts writes the
product's invariants forbid.

Do this before the first deployment, not after it: the build reads the database.
The sitemap is prerendered from the published storyboards, so a build with no
`DATABASE_URL`, or with one whose tables do not exist yet, fails.

Expect the seed to take minutes from a laptop far from the database: every
statement is a round trip, and at 300 ms one it took under four. That is also
why the seed allows its transactions two minutes, where the application keeps
Prisma's five seconds.

**Put the functions next to the database.** Read the database's region in the
Prisma Console, and set the app project's function region to the same one
(Vercel → Settings → Functions). The application's transactions get five
seconds. In the same region a statement takes a millisecond or two; across an
ocean it takes hundreds, and a transaction of twenty statements fails.

Point tools — Prisma Studio, `psql`, a script of your own — at the **direct**
host. A session-level `SET` sent through the pooled one does not end with your
session: it stays on the shared server connection and reaches whoever is given
it next.

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
preview origin too if you want imports to work on preview deployments, and
`http://localhost:3200` if you want them to work from `pnpm dev` with the bucket
configured. The browser flows blank the four variables, so they never need it.

An upload lives until its import is committed, or for a day if it never is: the
daily `purge` job removes older ones, file and row together.

---

## 3. Email

One of two providers. Resend is the one to grow into; SMTP through Gmail is the
one that works today without a domain (decision 0029). With both set, Resend is
used.

### Resend

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

### SMTP, through Gmail

Turn on 2-Step Verification for the Google account, then create an **app
password** under Security → 2-Step Verification → App passwords. Google shows
it as four groups of four letters; the spaces are only for display. The account
password does not work here.

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=you@gmail.com
SMTP_PASSWORD=abcdabcdabcdabcd
EMAIL_FROM="Storyboard <you@gmail.com>"
```

`EMAIL_FROM` has to be the same address as `SMTP_USER`: Gmail sends as the
account that logged in, whatever the message says. Port 465 is TLS from the
start. 587 works too, and the connection is refused if the server will not
upgrade it.

Know the limits before relying on it. A personal account sends to roughly 500
recipients a day, and Google blocks sending for up to a day past that. Changing
the account password revokes every app password, which stops all mail at once.
`pnpm check-deploy` logs in without sending, so it catches a revoked password.

### Either way

Until a provider is set the console mailer prints each message to stdout. That is
correct on a laptop and useless in production, which is why a publicly reachable
deployment refuses to start without one: otherwise sign-up appears to work and
every new account is stranded waiting for a verification link that went to a log.

Prove it with a real message before launch:

```sh
pnpm check-deploy --email you@example.com
```

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

Set these in **Settings → Environment Variables**. ● is required, ○ optional, and
◐ one of two: Resend's key, or the SMTP host, user and password. The marketing
site needs only the two public URLs.

| Variable                    | App | Web | Notes                                            |
| --------------------------- | :-: | :-: | ------------------------------------------------ |
| `DATABASE_URL`              |  ●  |     | `pooled.db.prisma.io`. Production only, by hand  |
| `DIRECT_DATABASE_URL`       |  ○  |     | `db.prisma.io`. Only needed where migrations run |
| `AUTH_SECRET`               |  ●  |     | `openssl rand -base64 32`                        |
| `AUTH_URL`                  |  ●  |     | `https://app.your-domain`                        |
| `AUTH_TRUST_HOST`           |  ●  |     | `true`                                           |
| `EMAIL_FROM`                |  ●  |     | On the verified domain                           |
| `RESEND_API_KEY`            |  ◐  |     | This, or the three `SMTP_*` below                |
| `SMTP_HOST`                 |  ◐  |     | `smtp.gmail.com`. Host, user, password together  |
| `SMTP_PORT`                 |  ○  |     | `465` is the default                             |
| `SMTP_USER`                 |  ◐  |     | The Gmail address; the same one as `EMAIL_FROM`  |
| `SMTP_PASSWORD`             |  ◐  |     | The app password, not the account password       |
| `CRON_SECRET`               |  ●  |     | `openssl rand -hex 32`                           |
| `R2_ACCOUNT_ID`             |  ●  |     | All four, or none                                |
| `R2_ACCESS_KEY_ID`          |  ●  |     |                                                  |
| `R2_SECRET_ACCESS_KEY`      |  ●  |     |                                                  |
| `R2_BUCKET`                 |  ●  |     |                                                  |
| `AUTH_GOOGLE_ID`            |  ○  |     | Both or neither; no button without them          |
| `AUTH_GOOGLE_SECRET`        |  ○  |     |                                                  |
| `UPSTASH_REDIS_REST_URL`    |  ○  |     | Both or neither; limits run on Postgres without  |
| `UPSTASH_REDIS_REST_TOKEN`  |  ○  |     |                                                  |
| `NEXT_PUBLIC_APP_URL`       |  ●  |  ●  | `https://app.your-domain`                        |
| `NEXT_PUBLIC_MARKETING_URL` |  ●  |  ●  | `https://your-domain`                            |
| `LOG_LEVEL`                 |  ○  |  ○  | `info` is the default                            |

`NEXT_PUBLIC_*` values are compiled into the browser bundle at build time, not
read at runtime. Changing one requires a new deployment, not a restart — and
they are declared in `turbo.json`'s `globalEnv` so that changing one actually
invalidates the build cache instead of silently serving a build with the old URL
baked in.

### What the app refuses to start without

`apps/app/src/env-preflight.ts` runs at startup. When `NEXT_PUBLIC_APP_URL` is
not a loopback address — that is, when strangers can reach this deployment — it
requires a mail provider, a real sender, a cron secret, https URLs, and object
storage on a serverless host. It lists **every** problem at once rather than one
per attempt, and the message names the variable and what would silently happen
without it.

The check is keyed to the public URL rather than `NODE_ENV` deliberately:
`NODE_ENV` is `production` for `next build`, for `next start` on a laptop, and
for the Playwright suite, none of which have a mail provider or want one.

`ALLOW_INCOMPLETE_DEPLOYMENT=1` downgrades all of it to warnings, for a staging
box where none of it matters. It should never be set on the real thing.

---

## 5. Scheduled work

Six jobs, in `.github/workflows/cron.yml` (decisions 0012 and 0030):

| Job         | Schedule      | What it does                                                                  |
| ----------- | ------------- | ----------------------------------------------------------------------------- |
| `immediate` | every 10 min  | Decisions on your own work (FR-12.3)                                          |
| `hourly`    | hourly        | Everything that is not about your own work                                    |
| `weekly`    | Mondays 09:00 | The weekly digest                                                             |
| `nudge`     | daily 08:30   | The seven-day silence nudge (FR-12.4)                                         |
| `prune`     | daily 03:15   | Expired rate-limit rows                                                       |
| `purge`     | daily 03:45   | Storyboards past their 30 days, accounts past their 7, imports left for a day |

Times are UTC. Each run sends `Authorization: Bearer $CRON_SECRET`, which is
what `/api/cron/[job]` checks — with a constant-time comparison, so the secret
cannot be guessed a byte at a time.

The workflow needs two things in the GitHub repository, under **Settings →
Secrets and variables → Actions**:

| Kind     | Name          | Value                                                           |
| -------- | ------------- | --------------------------------------------------------------- |
| Secret   | `CRON_SECRET` | The same value as the app's `CRON_SECRET` on Vercel             |
| Variable | `APP_URL`     | The app's public URL, e.g. `https://draftboard-cyan.vercel.app` |

Without `APP_URL` every run is skipped, so a fork does nothing. To check a job,
run it by hand: **Actions → Scheduled jobs → Run workflow**.

Two things to know. GitHub starts scheduled runs late when it is busy, usually
by minutes. And it stops scheduling them in a repository with no commit for 60
days — it emails when it does, and the workflow has to be re-enabled.

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

NFR-8 asks for a daily backup kept for 30 days. Prisma Postgres snapshots once
a day on paid plans only (7 days on Starter and Pro, 30 on Business, none on
Free), so the backup is a workflow of our own, whatever the plan (decision
0033): `.github/workflows/backup.yml`.

- **Nightly**, 21:30 UTC: `pg_dump` over the direct host, checked, encrypted
  with a passphrase, and written to an R2 bucket of its own.
- **Sundays**: the newest backup is restored into an empty PostgreSQL 17 and
  `pnpm db:drill` runs against it. It fails if that backup is more than 36
  hours old, which is how a nightly job that quietly stopped gets noticed.

GitHub emails you when a scheduled run fails.

### The bucket

A second bucket, **not** the uploads one, with its own API token. The
application's key lives on the server; if it could reach the backups, anyone
who took the server could delete them.

1. **R2 → Create bucket**, e.g. `draftboard-backups`. Private, like the other.
2. **Settings → Bucket lock rules**: add a rule for the prefix `nightly/` that
   retains objects for **30 days**. Nothing can delete or overwrite a backup
   inside that window, the backup token included.
3. **Settings → Object lifecycle rules**: delete objects with the prefix
   `nightly/` after **31 days**: the day after their lock expires.
4. **R2 → Manage API tokens → Create**: **Object Read & Write**, applied to
   **this bucket only**.
5. Prove the separation. The application's key must be refused on the backup
   bucket:

   ```sh
   pnpm check-deploy --backup-bucket draftboard-backups
   ```

   If it is not, the application's token was made for every bucket. Make a new
   one for the uploads bucket only and replace the four `R2_*` values.

### The secrets

A passphrase first. It encrypts every backup, and without it none of them can
be read, so keep a copy somewhere that is not GitHub, such as a password
manager:

```sh
openssl rand -base64 32
```

Then, under **Settings → Secrets and variables → Actions** in the repository:

| Kind     | Name                          | Value                                                |
| -------- | ----------------------------- | ---------------------------------------------------- |
| Secret   | `BACKUP_DATABASE_URL`         | The direct string (`db.prisma.io`), never the pooled |
| Secret   | `BACKUP_PASSPHRASE`           | The passphrase above                                 |
| Secret   | `BACKUP_R2_ACCESS_KEY_ID`     | The backup token's access key id                     |
| Secret   | `BACKUP_R2_SECRET_ACCESS_KEY` | The backup token's secret                            |
| Variable | `BACKUP_BUCKET`               | The backup bucket's name                             |
| Variable | `R2_ACCOUNT_ID`               | The Cloudflare account id, the same as the app's     |

Without `BACKUP_BUCKET` every run is skipped. Then run it by hand once:
**Actions → Backups → Run workflow → backup**, and then **drill**. The drill's
summary is the dated record that goes in `04-phase-plan.md`.

### Restoring, for real

Into an **empty** PostgreSQL 17 or newer: a new Prisma Postgres database, or a
local one. A dump from 17 does not restore into 16. Download the backup from
the bucket in the Cloudflare dashboard, then, in Git Bash:

```sh
BACKUP_PASSPHRASE='…' bash packages/db/scripts/restore.sh 2026-10-15T2130Z.dump.gpg "postgresql://…empty…"
pnpm db:drill "postgresql://…the same…"
```

`restore.sh` decrypts with GnuPG, which ships with Git for Windows, and needs
PostgreSQL 17's `pg_restore` on `PATH` or in `PG_BIN`. It is all or nothing:
one transaction, stopped at the first error, so aimed at a database that
already has tables it refuses and changes nothing.

Having a backup is not the requirement; **restoring from it is**. A backup
nobody has restored is a hope.

```sh
pnpm db:drill "postgresql://…restored-copy…"
pnpm db:drill --quiet "postgresql://…"   # pass or fail only, for logs other people read
```

The drill checks four things against a database restored from a backup: that
every migration is applied and none is pending, that the invariants are really
there — the immutability trigger and both partial unique indexes, which are the
ones `db push` would have skipped — that the tables hold rows, and that a whole
storyboard can be read out of it, chapters and sections and revisions together.

Run it against a restored copy, never against production: it refuses to run if
the database looks like the live one by declining any URL that is also
`DATABASE_URL`.

Do this once before launch, and once a quarter after. Record the date in
`04-phase-plan.md`; an undated drill is indistinguishable from one that never
happened.

---

## Checking it, after every step

```sh
pnpm check-deploy                       # is it configured, and does any of it work
pnpm check-deploy --origin https://app.your-domain   # and the CORS rule for that origin
pnpm check-deploy --email you@you.com   # and send one real message, end to end
```

Run it after each account above, with that account's variables in the
environment. It is the difference between believing a key is right and knowing
it — it connects to the database, round-trips an object through the bucket,
asks the bucket whether a browser may upload to it, and sends a real email if
you ask it to.

This is deliberately not the same check the application makes at startup. The
preflight asks whether the variables are _present_, which is all it can safely
do at boot: a check that phoned a third party on every start would turn
somebody else's outage into yours. This one asks whether they are _right_, by
using them, which is only safe because a person chose to run it.

The CORS rule is the step most often missed, and the browser reports it as a
CORS error that says nothing about the bucket. The browser enforces the rule,
but it asks first, with an `OPTIONS` preflight, and the check sends that same
preflight against a presigned upload URL. It checks the origin of
`NEXT_PUBLIC_APP_URL`, which on a laptop is `localhost`; pass `--origin` to
check production's from there.

One thing it cannot check, and says so rather than implying otherwise: whether
the email actually _arrived_, and in which folder, is something only you can
look at.

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

| What you see                                       | Where to look                                                               |
| -------------------------------------------------- | --------------------------------------------------------------------------- |
| Deployment refuses to start, with a numbered list  | It is the preflight. Each line names its variable                           |
| Sign-up email never arrives                        | `pnpm check-deploy --email`; then Resend's log, or Gmail's Sent folder      |
| Gmail: "Username and Password not accepted"        | It wants an app password. Changing the account password revokes them        |
| Uploads fail, console shows a CORS error           | The R2 CORS rule. `AllowedOrigins` is the app's origin                      |
| Import works, then the parse cannot find the file  | R2 is not configured and instances do not share a disk                      |
| No digest ever arrives                             | The Actions tab: a 401 means the two `CRON_SECRET`s differ                  |
| Migration hangs on an advisory lock                | It is running over the pooled URL. Use `DIRECT_DATABASE_URL`                |
| "cannot execute INSERT in a read-only transaction" | A session `SET` went through the pooled host. `RESET` it on each connection |
| "Transaction API error … expired transaction"      | Round trips too slow: the function region is not the database's             |
| "DATABASE_URL must be a postgres:// connection"    | It is the `prisma+postgres://` URL. Use the `postgres://` one               |
| A build serves an old URL in the browser           | A `NEXT_PUBLIC_*` change needs a new deployment, not a restart              |
