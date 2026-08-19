import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";

export async function proxy(req: NextRequest) {
  const session = await getServerSession();
  if (!session) {
    const loginUrl = new URL("/login", req.url);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|login|_next/static|_next/image|favicon.ico).*)"],
};