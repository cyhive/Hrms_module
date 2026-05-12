import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { MongoError } from "mongodb";
import { getUserBySessionToken } from "./session-repo";
import { SafeUser } from "./types";

export const SESSION_COOKIE = "hr_session";

export async function getCurrentUserFromCookies(): Promise<SafeUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  try {
    return await getUserBySessionToken(token);
  } catch (e) {
    if (e instanceof MongoError) {
      console.error("[auth] MongoDB error during session lookup:", e.message);
      return null;
    }
    throw e;
  }
}

export async function getCurrentUserFromRequest(
  req: NextRequest,
): Promise<SafeUser | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  try {
    return await getUserBySessionToken(token);
  } catch (e) {
    if (e instanceof MongoError) {
      console.error("[auth] MongoDB error during session lookup:", e.message);
      return null;
    }
    throw e;
  }
}
