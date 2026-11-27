/**
 * Sample data is opt-in. With DEMO_MODE=true the routes that still carry a demo fallback answer from memory when the database is
 * unavailable; otherwise they rethrow so the caller sees a real error instead of invented data.
 */
export const demoMode = () => process.env.DEMO_MODE === 'true';

/** Call at the top of a catch block that used to fall back to sample data. */
export function demoOrThrow(err: unknown): void {
  if (!demoMode()) throw err;
}
