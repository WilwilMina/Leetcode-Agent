/**
 * Edge proxy that applies the deployment access gate to every request.
 *
 * Named `proxy.ts` rather than `middleware.ts` because Next 16 deprecated the middleware file
 * convention in favour of proxy.
 *
 * All the decision logic lives in `lib/auth/access.ts` as a pure function; this file is only the
 * Next.js plumbing that gathers request state, asks for a decision, and carries it out.
 */

import { NextResponse, type NextRequest } from "next/server";

import {
  ACCESS_COOKIE,
  ACCESS_QUERY_PARAM,
  checkAccess,
} from "@/lib/auth/access";

/** Cookie lifetime. Long enough not to be a nuisance, short enough to expire if a link leaks. */
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export default function proxy(request: NextRequest) {
  const decision = checkAccess({
    isProduction: process.env.NODE_ENV === "production",
    expectedSecret: process.env.APP_ACCESS_SECRET,
    cookieSecret: request.cookies.get(ACCESS_COOKIE)?.value ?? null,
    querySecret: request.nextUrl.searchParams.get(ACCESS_QUERY_PARAM),
  });

  if (decision.kind === "allow") {
    return NextResponse.next();
  }

  if (decision.kind === "grant") {
    // Strip the secret from the URL so it does not linger in history, logs, or a shared link.
    const cleanUrl = request.nextUrl.clone();
    cleanUrl.searchParams.delete(ACCESS_QUERY_PARAM);

    const response = NextResponse.redirect(cleanUrl);

    response.cookies.set(ACCESS_COOKIE, decision.secret, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: COOKIE_MAX_AGE_SECONDS,
    });

    return response;
  }

  // Deny. 404 rather than 401: an unauthorised visitor learns nothing about what is here, and
  // there is no login flow to point them at. The reason stays server-side.
  console.warn(`[access] denied: ${decision.reason} ${request.nextUrl.pathname}`);

  return new NextResponse("Not found", { status: 404 });
}

export const config = {
  /**
   * Run on everything except Next's own static output and the favicon. The API routes are the
   * budget-spending ones, but gating the pages too keeps the deployment genuinely private.
   */
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
