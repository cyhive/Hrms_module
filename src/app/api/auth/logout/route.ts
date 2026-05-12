import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";
import { clearSession } from "@/lib/session-repo";

export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  await clearSession(token);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}
