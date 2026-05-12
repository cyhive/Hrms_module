import { randomUUID } from "crypto";
import { Collection } from "mongodb";
import { getDb } from "./mongodb";

export interface ActivityRecord {
  _id: string;
  createdAt: string;
  actorUserId: string;
  actorUsername: string;
  message: string;
  kind?: string;
}

async function activitiesCollection(): Promise<Collection<ActivityRecord>> {
  const db = await getDb();
  return db.collection<ActivityRecord>("activities");
}

export async function recordActivity(input: {
  actorUserId: string;
  actorUsername: string;
  message: string;
  kind?: string;
}): Promise<void> {
  try {
    const col = await activitiesCollection();
    await col.insertOne({
      _id: randomUUID(),
      createdAt: new Date().toISOString(),
      actorUserId: input.actorUserId,
      actorUsername: input.actorUsername,
      message: input.message.trim().slice(0, 2000),
      kind: input.kind,
    });
  } catch {
    /* never block primary operations */
  }
}

export async function listRecentActivities(limit = 80): Promise<ActivityRecord[]> {
  const col = await activitiesCollection();
  const rows = await col.find({}).sort({ createdAt: -1 }).limit(Math.min(limit, 200)).toArray();
  return rows;
}
