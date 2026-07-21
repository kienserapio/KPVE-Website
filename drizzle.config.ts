import type { Config } from "drizzle-kit";

// drizzle-kit runs outside Next, so .env.local is not loaded automatically.
import { config } from "dotenv";
config({ path: ".env.local" });

export default {
  schema: "./lib/db/schema.ts",
  out: "./lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  strict: true,
  verbose: true,
} satisfies Config;
