/**
 * The real reason behind a failed `supabase.functions.invoke`. supabase-js
 * turns every non-2xx into a FunctionsHttpError whose message is the useless
 * "Edge Function returned a non-2xx status code"; the function's own
 * `{ error }` is in the response body.
 */
export async function invokeErrorMessage(error: unknown, data: { error?: string } | null | undefined): Promise<string | null> {
  if (data?.error) return data.error;
  if (!error) return null;
  try {
    const ctx = (error as { context?: { clone?: () => { json: () => Promise<{ error?: string }> } } }).context;
    if (ctx?.clone) {
      const body = await ctx.clone().json();
      if (body?.error) return body.error;
    }
  } catch { /* not JSON */ }
  return error instanceof Error ? error.message : "Something went wrong";
}
