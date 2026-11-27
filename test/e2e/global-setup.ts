import pg from "pg";

/** Clears auth rate-limit counters in the (test-only) database so repeated runs don't hit 429s. */
export default async function globalSetup() {
  const url = process.env.E2E_DATABASE_URL ?? "postgres://postgres@localhost:55432/train_test";
  if (!/test/.test(new URL(url).pathname)) throw new Error("refusing to touch a non-test database");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("delete from rate_limit");
  } finally {
    await client.end();
  }
}
