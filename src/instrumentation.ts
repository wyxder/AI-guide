/**
 * Next.js Instrumentation Hook
 * Runs ONCE before any server-side code in every Serverless Function worker.
 * This ensures env vars are available at runtime even when Vercel environment
 * variables are not explicitly configured in the dashboard.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  // Secrets must come from environment variables only (never hardcode them here,
  // otherwise Netlify secrets scanning will fail the build).
  process.env.EAZO_APP_ID = process.env.EAZO_APP_ID || "";
  process.env.NEXT_PUBLIC_EAZO_APP_ID = process.env.NEXT_PUBLIC_EAZO_APP_ID || "";
  process.env.EAZO_PLATFORM_API_BASE = process.env.EAZO_PLATFORM_API_BASE || "";
  process.env.EAZO_PRIVATE_KEY = process.env.EAZO_PRIVATE_KEY || "";
  process.env.DATABASE_URL = process.env.DATABASE_URL || "";
}
