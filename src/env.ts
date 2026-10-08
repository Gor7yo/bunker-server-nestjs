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

export const CLIENT_ORIGIN =
  process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';

export const LIVEKIT = {
  url: process.env.LIVEKIT_URL ?? '',
  apiKey: process.env.LIVEKIT_API_KEY ?? '',
  apiSecret: process.env.LIVEKIT_API_SECRET ?? '',
};
