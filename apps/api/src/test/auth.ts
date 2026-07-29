import { SignJWT } from "jose";

/** Mints a token in the same shape apps/web's /api/token route produces,
 * signed with the same AUTH_SECRET the test env configures (see .env.test) -
 * so the API's auth plugin verifies it exactly like a real session token. */
export async function signTestToken(userId: string, email = "test@integration-test.dev"): Promise<string> {
  const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret);
}
