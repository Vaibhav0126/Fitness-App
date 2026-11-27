/**
 * `pnpm db:seed`: global exercise aliases + the read-only demo user with 12 weeks of
 * synthetic data. Idempotent: safe to re-run (the demo data is regenerated for today).
 * The default plan template ("Upper/Lower 4-day + 8-week run-walk") lives in code:
 * src/lib/engine/config.ts → defaultPlanConfig().
 */
import "./load-env";
import { closeDb, getDb } from "../src/lib/db/client";
import { seedAliases } from "../src/server/seed/aliases";
import { regenerateDemo } from "../src/server/seed/demo";

async function main() {
  const db = getDb();
  const aliases = await seedAliases(db);
  console.info(`exercise aliases: ${aliases}`);
  const demo = await regenerateDemo(db);
  console.info(`demo user: ${JSON.stringify(demo)}`);
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
