export { auth as middleware } from "@/lib/auth";

// Excludes ALL of /api (not just /api/auth) — corrected 2026-08-19.
// API routes enforce their own auth via getServerSession and return a clean
// 401 JSON response; letting middleware redirect them instead would send a
// fetch() call a 3xx pointing at the sign-in HTML page, which the client
// can't parse as JSON. Page navigation (everything else) is still protected
// here, per the roadmap's "the app itself must enforce auth, not just
// SharePoint" requirement.
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
