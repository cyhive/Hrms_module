import { randomUUID } from "crypto";
import { Collection } from "mongodb";
import { getDb } from "./mongodb";
import { SafeUser } from "./types";
import { findUserById, isLoginBlockedAfterOffboarding } from "./user-repo";

interface SessionRecord {
  _id: string;
  userId: string;
  createdAt: string;
}

async function sessionsCollection(): Promise<Collection<SessionRecord>> {
  const db = await getDb();
  return db.collection<SessionRecord>("sessions");
}

export async function createSession(userId: string): Promise<string> {
  const sessions = await sessionsCollection();
  const token = randomUUID();
  await sessions.insertOne({
    _id: token,
    userId,
    createdAt: new Date().toISOString(),
  });
  return token;
}

export async function getUserBySessionToken(
  token: string | undefined,
): Promise<SafeUser | null> {
  if (!token) return null;
  const sessions = await sessionsCollection();
  const session = await sessions.findOne({ _id: token });
  if (!session) return null;
  const user = await findUserById(session.userId);
  if (!user) return null;
  if (user.role === "employee" && (await isLoginBlockedAfterOffboarding(user._id))) {
    await sessions.deleteOne({ _id: token });
    return null;
  }

  return {
    id: user._id,
    username: user.username,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt,
  };
}

export async function clearSession(token: string | undefined): Promise<void> {
  if (!token) return;
  const sessions = await sessionsCollection();
  await sessions.deleteOne({ _id: token });
}
