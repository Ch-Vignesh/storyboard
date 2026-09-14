# Security policy

Storyboard holds unpublished manuscripts that writers have chosen to trust to
it. A data exposure is the most serious class of bug this project can have.

## Reporting a vulnerability

Please do not open a public issue for a security problem.

Email **security@<your-domain>** (TODO: set a real address before the first
public release) with a description, steps to reproduce, and the impact you
believe it has. You will get an acknowledgement within 72 hours and a plan
within 7 days.

## Scope

In scope: anything that lets a person read, change or delete a storyboard,
revision, suggestion, credit or account they are not permitted to; anything
that bypasses the revision immutability trigger; anything that lets one user
act as another.

Out of scope: copying text from a public storyboard by ordinary means. The
product states plainly that it cannot prevent this (docs/01-srs.md, FR-13.6).

## Supported versions

Only the `main` branch is supported until the first tagged release.
