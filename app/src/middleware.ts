import { NextRequest, NextResponse } from "next/server";
import { getRequestSession } from "@/lib/session";

const PUBLIC_PATHS = ["/login", "/signup", "/forgot-password", "/api/auth/login", "/api/auth/signup", "/workspace/new"];
const AUTH_ONLY_PATHS = ["/login", "/signup", "/forgot-password"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.match(/\.(ico|png|jpg|jpeg|svg|mp4|webm|mp3)$/) ||
    (pathname.startsWith("/api") && !pathname.startsWith("/api/auth"))
  ) {
    return NextResponse.next();
  }

  const session = await getRequestSession(req);

  if (session && AUTH_ONLY_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  if (!session && !PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|webm|mp3)$).*)"],
};
