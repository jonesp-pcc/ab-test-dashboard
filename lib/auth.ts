import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";

const COOKIE_NAME = "dashboard_session";

function expectedToken(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return createHmac("sha256", secret).update("authenticated").digest("hex");
}

export function checkPassword(submitted: string): boolean {
  const actual = process.env.DASHBOARD_PASSWORD;
  if (!actual) throw new Error("DASHBOARD_PASSWORD is not set");
  const a = Buffer.from(submitted);
  const b = Buffer.from(actual);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function sessionCookieValue(): string {
  return expectedToken();
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;

export async function getServerSession(): Promise<{ authenticated: true } | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const expected = expectedToken();
    const a = Buffer.from(token);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return null;
    return timingSafeEqual(a, b) ? { authenticated: true } : null;
  } catch {
    return null;
  }
}