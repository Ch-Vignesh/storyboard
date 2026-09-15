/**
 * A stand-in for `server-only` under Vitest.
 *
 * The real package throws on import outside a server component, which is
 * exactly what it is for — and which makes every module that imports it
 * untestable. Aliasing it here keeps the guard in the build (where it catches
 * a client component reaching for the database) and out of the test run (where
 * there are no client components to catch).
 *
 * The alternative was to leave `server-only` off the modules that need testing,
 * which trades a real protection for a test-runner convenience.
 */
export {}
