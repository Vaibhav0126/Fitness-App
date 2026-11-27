import { migrate } from "drizzle-orm/node-postgres/migrator";
import "./load-env";
import { closeDb, getDb } from "../src/lib/db/client";

async function main() {
  await migrate(getDb(), { migrationsFolder: "./drizzle" });
  console.info("migrations applied");
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
