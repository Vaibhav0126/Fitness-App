import { and, eq, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable, PgUpdateSetSource, PgInsertValue } from "drizzle-orm/pg-core";
import { type Db, getDb } from "./client";

/** Any app table with an owning `userId` column. */
export type OwnedTable = PgTable & { userId: PgColumn };

/**
 * Row-level ownership: every read, update and delete made through this helper is
 * filtered by `userId`, and every insert has `userId` forced. App code must not query
 * owned tables any other way (enforced by review + test/integration/isolation.test.ts).
 */
export function scoped(userId: string, db: Db = getDb()) {
  if (!userId) throw new Error("scoped() requires a userId");

  const owns = (table: OwnedTable, ...conds: Array<SQL | undefined>): SQL =>
    and(eq(table.userId, userId), ...conds) as SQL;

  return {
    userId,
    db,
    /** WHERE clause including the ownership filter, for custom queries. */
    owns,
    select<T extends OwnedTable>(table: T, ...conds: Array<SQL | undefined>) {
      return db
        .select()
        .from(table as PgTable)
        .where(owns(table, ...conds)) as unknown as Promise<T["$inferSelect"][]>;
    },
    insert<T extends OwnedTable>(table: T, values: Array<Omit<PgInsertValue<T>, "userId">>) {
      const rows = values.map((v) => ({ ...v, userId }) as PgInsertValue<T>);
      return db.insert(table).values(rows);
    },
    update<T extends OwnedTable>(table: T, set: PgUpdateSetSource<T>, ...conds: Array<SQL | undefined>) {
      // Never allow moving a row to another owner.
      const { userId: _ignored, ...safe } = set as Record<string, unknown>;
      return db
        .update(table)
        .set(safe as PgUpdateSetSource<T>)
        .where(owns(table, ...conds));
    },
    delete<T extends OwnedTable>(table: T, ...conds: Array<SQL | undefined>) {
      return db.delete(table).where(owns(table, ...conds));
    },
  };
}

export type Scoped = ReturnType<typeof scoped>;
