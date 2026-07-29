import type { NextAuthConfig } from "next-auth";

/** The edge-safe subset of the NextAuth config: no adapter, no providers
 * that pull in Node-only code (Nodemailer, Prisma). middleware.ts runs on
 * the Edge runtime and only needs to read the JWT session to decide
 * redirect-or-not, so it builds its NextAuth instance from this file alone -
 * see auth.ts for the full config (adapter + providers) used everywhere
 * else (route handlers, server components). */
export default {
  session: { strategy: "jwt" },
  secret: process.env.AUTH_SECRET,
  pages: { signIn: "/sign-in" },
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
  },
} satisfies NextAuthConfig;
