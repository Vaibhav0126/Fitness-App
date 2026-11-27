import { getTableColumns, getTableName } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { getAuthTables } from "better-auth/db";
import { describe, expect, it } from "vitest";
import { authOptions } from "@/lib/auth/options";
import * as schema from "@/lib/db/schema";

/**
 * Guards against Better Auth upgrades changing its expected schema: every field Better
 * Auth needs must exist on our Drizzle tables with a matching nullability.
 */
describe("Better Auth schema", () => {
  const tables = getAuthTables(authOptions());
  const drizzleTables = schema as unknown as Record<string, PgTable>;

  for (const [key, def] of Object.entries(tables)) {
    it(`table ${def.modelName} matches`, () => {
      const table = drizzleTables[def.modelName] ?? drizzleTables[key];
      expect(table, `missing Drizzle table export "${def.modelName}"`).toBeDefined();
      const cols = getTableColumns(table!);
      for (const [field, attr] of Object.entries(def.fields)) {
        const col = cols[field];
        expect(col, `${getTableName(table!)}.${field} missing`).toBeDefined();
        if (attr.required !== false && attr.defaultValue === undefined) {
          expect(col!.notNull, `${getTableName(table!)}.${field} should be NOT NULL`).toBe(true);
        }
      }
    });
  }
});
