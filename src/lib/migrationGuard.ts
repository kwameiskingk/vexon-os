// Helpers for code that must ship before its migration is applied.
//
// Migrations in this repo are applied by hand in the hosted SQL editor, so a
// branch can be previewed with some or all of its SQL still pending. Rather
// than crash, surfaces that depend on a pending migration degrade to an empty
// state plus a one-line warning telling you which script to run.
//
// This only swallows "the schema isn't there yet" errors. Every other error
// still throws, so real failures stay loud.

/** Postgres / PostgREST codes that mean "this table or column doesn't exist". */
const MISSING_SCHEMA_CODES = new Set([
  "42P01", // undefined_table
  "42703", // undefined_column
  "PGRST200", // could not find a relationship
  "PGRST204", // column not found in schema cache
  "PGRST205", // table not found in schema cache
]);

export interface SupabaseLikeError {
  code?: string | null;
  message?: string | null;
}

export function isMissingSchemaError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as SupabaseLikeError;
  if (e.code && MISSING_SCHEMA_CODES.has(e.code)) return true;
  const msg = (e.message ?? "").toLowerCase();
  return (
    msg.includes("does not exist") ||
    msg.includes("could not find the table") ||
    msg.includes("could not find the") ||
    msg.includes("schema cache")
  );
}

/** What a guarded query returns: data, or a flag saying the schema is pending. */
export interface GuardedResult<T> {
  data: T;
  /** True when the query failed only because its migration hasn't been run. */
  migrationPending: boolean;
}

export const guarded = <T,>(data: T): GuardedResult<T> => ({ data, migrationPending: false });

export const pending = <T,>(fallback: T): GuardedResult<T> => ({
  data: fallback,
  migrationPending: true,
});

/**
 * Run a supabase query; if it fails only because the schema is pending,
 * resolve to `fallback` with migrationPending set. Anything else rethrows.
 */
export async function withMigrationGuard<T>(
  run: () => Promise<{ data: T | null; error: SupabaseLikeError | null }>,
  fallback: T,
): Promise<GuardedResult<T>> {
  const { data, error } = await run();
  if (error) {
    if (isMissingSchemaError(error)) return pending(fallback);
    throw error;
  }
  return guarded((data ?? fallback) as T);
}
