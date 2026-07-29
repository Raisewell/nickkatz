let cached: { token: string; expiresAt: number } | null = null;
let inflight: Promise<string> | null = null;

async function fetchToken(): Promise<string> {
  const res = await fetch("/api/token");
  if (!res.ok) {
    cached = null;
    throw new Error("Not authenticated");
  }
  const { token, expiresIn } = (await res.json()) as { token: string; expiresIn: number };
  cached = { token, expiresAt: Date.now() + expiresIn * 1000 };
  return token;
}

/** Returns a bearer token for the API, minted from the current browser
 * session and cached until shortly before it expires. Callers never see
 * NextAuth's own session cookie format - this is a separate, short-lived
 * HS256 JWT the Fastify API verifies independently (see apps/api's auth
 * plugin), so the two services don't need to agree on NextAuth internals. */
export async function getApiToken(): Promise<string> {
  if (cached && cached.expiresAt - Date.now() > 30_000) return cached.token;
  if (!inflight) inflight = fetchToken().finally(() => (inflight = null));
  return inflight;
}

export function clearApiToken() {
  cached = null;
}
