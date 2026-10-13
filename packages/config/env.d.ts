/** Load the repository-root `.env` into `process.env`. Returns the path that was looked for. */
export function loadRootEnv(): string

/** The host a connection string points at, or `undefined` if it does not parse. */
export function databaseHost(url: string): string | undefined

/** Whether a connection string names a database on this machine. */
export function isLocalDatabase(url: string): boolean

/** Whether two connection strings name one database: a pool and its direct host are one, two logins on a shared host are two. */
export function sameDatabase(a: string, b: string): boolean

/** For a test run: treat a `DATABASE_URL` that is not on this machine as unset. */
export function keepTestsOffHostedDatabases(): void
