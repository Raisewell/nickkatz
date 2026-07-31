import { SignJWT } from "jose";
import { auth } from "@/auth";

const TOKEN_TTL_SECONDS = 15 * 60;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
  const token = await new SignJWT({ email: session.user.email ?? undefined })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.user.id)
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
    .sign(secret);

  return Response.json({ token, expiresIn: TOKEN_TTL_SECONDS });
}
