# Security policy

Draftboard holds unpublished manuscripts that writers have chosen to trust to
it. A data exposure is the most serious class of bug this project can have.

## Reporting a vulnerability

Please do not open a public issue for a security problem.

Email the address on the deployment's contact page,
[draftboard-cyan.vercel.app/contact](https://draftboard-cyan.vercel.app/contact),
with a description, steps to reproduce, and the impact you believe it has. That
page shows the deployment's support address (`SUPPORT_EMAIL`, or the sender's
address when none is set), so this file never goes stale. You will get an
acknowledgement within 72 hours and a plan within 7 days.

## Scope

In scope: anything that lets a person read, change or delete a story, a
revision, a published edition, a suggestion, a credit or an account they are
not permitted to; anything that bypasses the revision immutability trigger or
changes a published edition; anything that lets one user act as another.

Out of scope: copying text from a public story by ordinary means. The
product states plainly that it cannot prevent this (docs/01-srs.md, FR-13.6).

## Supported versions

Only the `main` branch is supported until the first tagged release.
