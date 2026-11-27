import { afterAll } from "vitest";
import { closeDb } from "@/lib/db/client";

process.env.DATABASE_URL ??=
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/train_test";
if (!/test/.test(process.env.DATABASE_URL)) {
  throw new Error("Integration tests must run against a database whose name contains 'test'");
}

afterAll(async () => {
  await closeDb();
});
