import type { MongoClientOptions } from "mongodb";
import { MongoClient } from "mongodb";

declare global {
  var __mongo: { uri: string; promise: Promise<MongoClient> } | undefined;
}

/** Prefer full `MONGODB_URI`, or set user/password/host so the password is URL-encoded for you. */
function resolveMongoUri(): string {
  const direct = process.env.MONGODB_URI?.trim();
  if (direct) {
    return ensureAtlasDefaults(direct);
  }

  const user = process.env.MONGODB_USER?.trim();
  const password = process.env.MONGODB_PASSWORD ?? "";
  const host = process.env.MONGODB_CLUSTER_HOST?.trim();
  if (user && host) {
    const u = encodeURIComponent(user);
    const p = encodeURIComponent(password);
    return `mongodb+srv://${u}:${p}@${host}/?retryWrites=true&w=majority&authSource=admin`;
  }

  throw new Error(
    "Missing MONGODB_URI, or MONGODB_USER + MONGODB_PASSWORD + MONGODB_CLUSTER_HOST",
  );
}

function ensureAtlasDefaults(uri: string): string {
  let out = uri;
  if (!/[?&]retryWrites=/i.test(out)) {
    out += out.includes("?") ? "&retryWrites=true" : "?retryWrites=true";
  }
  if (!/[?&]w=/i.test(out)) {
    out += "&w=majority";
  }
  if (!/[?&]authSource=/i.test(out)) {
    out += "&authSource=admin";
  }
  return out;
}

const dbName = (process.env.MONGODB_DB_NAME ?? "hr_management_system").trim();

function mongoClientOptions(): MongoClientOptions {
  // Node's dual-stack resolution can prefer a broken IPv6 route; the TLS handshake
  // to Atlas then fails with OpenSSL "SSL alert number 80" / tlsv1 internal error.
  // Prefer IPv4 on Windows where this is commonly reported (Node 18+).
  if (process.platform === "win32") {
    return { autoSelectFamily: false, family: 4 };
  }
  return {};
}

export async function getDb() {
  const uri = resolveMongoUri();

  if (!global.__mongo || global.__mongo.uri !== uri) {
    global.__mongo = {
      uri,
      promise: new MongoClient(uri, mongoClientOptions()).connect(),
    };
  }

  const entry = global.__mongo;
  try {
    const client = await entry.promise;
    return client.db(dbName);
  } catch (err) {
    if (global.__mongo?.uri === uri) {
      global.__mongo = undefined;
    }
    throw err;
  }
}
