import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // only needed for migrate/push, not for generate
    url: process.env.DATABASE_URL ?? "",
  },
});
