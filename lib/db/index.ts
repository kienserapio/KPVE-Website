import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local.");
}

/**
 * Reuse the client across hot reloads in dev. Without this, every file save
 * opens a fresh pool and Neon starts refusing connections.
 */
const globalForDb = globalThis as unknown as {
  __kpveSql?: ReturnType<typeof postgres>;
};

const sql =
  globalForDb.__kpveSql ??
  postgres(connectionString, {
    // Neon's pooled endpoint does its own pooling; keep ours small so
    // serverless instances don't each hold a large pool open.
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false, // required for transaction-mode poolers like Neon's -pooler host
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__kpveSql = sql;
}

export const db = drizzle(sql, { schema });
export { schema };
