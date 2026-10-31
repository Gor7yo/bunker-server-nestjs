// Must be the first import in main.ts: decorators read process.env at import time.
// .env.local (git-ignored secrets) is loaded first; loadEnvFile never
// overrides variables that are already set, so it wins over .env.
for (const file of ['.env.local', '.env']) {
  try {
    process.loadEnvFile(file);
  } catch {
    // File is optional — rely on the real environment.
  }
}

/**
 * Allowed client origins for CORS. Comma-separated; each one is normalized
 * the way browsers send Origin: scheme added if missing, no trailing slash
 * ("my-app.vercel.app/" → "https://my-app.vercel.app").
 */
const normalizeOrigin = (raw: string) => {
  const origin = raw.trim().replace(/\/+$/, '');
  if (/^https?:\/\//i.test(origin)) return origin;
  const isLocal = /^(localhost|127\.0\.0\.1)(:|$)/.test(origin);
  return `${isLocal ? 'http' : 'https'}://${origin}`;
};

export const CLIENT_ORIGIN: string[] = (
  process.env.CLIENT_ORIGIN || 'http://localhost:5173'
)
  .split(',')
  .map(normalizeOrigin)
  .filter((origin) => origin !== 'https://');

/** Sentry project DSN; empty — error reporting is off. */
export const SENTRY_DSN = process.env.SENTRY_DSN ?? '';

export const LIVEKIT = {
  url: process.env.LIVEKIT_URL ?? '',
  apiKey: process.env.LIVEKIT_API_KEY ?? '',
  apiSecret: process.env.LIVEKIT_API_SECRET ?? '',
};
