import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import authConfig from "@/auth.config";

// Deliberately built from the edge-safe auth.config.ts (no adapter, no
// Node-only providers) rather than importing the full auth.ts - see that
// file's comment for why.
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  if (!req.auth) {
    const signInUrl = new URL("/sign-in", req.nextUrl.origin);
    signInUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return NextResponse.redirect(signInUrl);
  }
});

export const config = {
  // /api/token is excluded too: it's called via fetch and returns its own
  // JSON 401 when unauthenticated, rather than a redirect fetch can't use.
  matcher: ["/((?!api/auth|api/token|sign-in|_next/static|_next/image|favicon.ico).*)"],
};
