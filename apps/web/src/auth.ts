import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import Google from "next-auth/providers/google";
import Nodemailer from "next-auth/providers/nodemailer";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import authConfig from "./auth.config";

const providers: Provider[] = [];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    Google({ clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET })
  );
}

if (process.env.EMAIL_SERVER) {
  providers.push(Nodemailer({ server: process.env.EMAIL_SERVER, from: process.env.EMAIL_FROM }));
}

// Dev-only sign-in: picks an existing user by email with no password check.
// Real deployments never set AUTH_ENABLE_DEV_LOGIN, so this provider simply
// doesn't register - Google OAuth and/or email magic links are the only way
// in once real credentials are configured.
if (process.env.AUTH_ENABLE_DEV_LOGIN === "true") {
  providers.push(
    Credentials({
      id: "dev-login",
      name: "Dev login (no password)",
      credentials: { email: { label: "Email", type: "email" } },
      async authorize(credentials) {
        const email = typeof credentials?.email === "string" ? credentials.email : undefined;
        if (!email) return null;
        const user = await prisma.user.findUnique({ where: { email } });
        return user ? { id: user.id, email: user.email, name: user.name, image: user.image } : null;
      },
    })
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  // @auth/prisma-adapter's types resolve PrismaClient from the default
  // "@prisma/client" package path; ours is generated to a custom output
  // (see prisma/schema.prisma) to avoid colliding with apps/api's client
  // under pnpm's hoisting. Same runtime shape, nominally distinct type.
  // @ts-expect-error - see comment above
  adapter: PrismaAdapter(prisma),
  providers,
});
