import { existsSync } from "node:fs";

/**
 * Loads `.env.local`, then `.env`, for CLI scripts (Next.js does this itself for the app).
 * Variables already set in the environment win, so CI and one-off overrides
 * (`DATABASE_URL=… pnpm db:migrate`) keep working.
 */
for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}
