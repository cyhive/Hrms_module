/**
 * Ensures the default admin user exists (same logic as first login).
 * Loads `.env.local` before importing DB code so `MONGODB_URI` is available.
 *
 * Run: npm run db:seed
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal(): void {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) {
    console.error("Create .env.local with MONGODB_URI (and optional MONGODB_DB_NAME) first.");
    process.exit(1);
  }
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

async function main(): Promise<void> {
  loadEnvLocal();
  const { ensureSeedAdmin } = await import("../src/lib/user-repo");
  const { SEED_ADMIN_PASSWORD, SEED_ADMIN_USERNAME } = await import("../src/lib/seed-defaults");
  await ensureSeedAdmin();
  console.log(
    `Seed complete. If no admin existed, created user "${SEED_ADMIN_USERNAME}" / "${SEED_ADMIN_PASSWORD}".`,
  );
  console.log("If admin already existed, the database was left unchanged.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
