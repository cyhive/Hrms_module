import { NextRequest, NextResponse } from "next/server";
import { MongoError } from "mongodb";
import { SESSION_COOKIE } from "@/lib/auth";
import { createSession } from "@/lib/session-repo";
import { validateCredentials } from "@/lib/user-repo";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const username = String(body.username ?? "").trim();
  const password = String(body.password ?? "");

  if (!username || !password) {
    return NextResponse.json(
      { error: "Username and password are required" },
      { status: 400 },
    );
  }

  try {
    const user = await validateCredentials(username, password);
    if (!user) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const token = await createSession(user.id);
    const res = NextResponse.json({ user });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
    return res;
  } catch (e) {
    if (e instanceof MongoError) {
      console.error("[auth/login] MongoDB error:", e.message);
      return NextResponse.json(
        {
          error:
            "The app could not connect to MongoDB. Fix MONGODB_URI (Atlas database user + password) in .env.local, then restart the dev server.",
        },
        { status: 503 },
      );
    }
    throw e;
  }
}
