import { config } from "dotenv";
import type { Config } from "drizzle-kit";

config();

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) throw new Error("DATABASE_URL is not defined in .env file");

const url = new URL(dbUrl);
const searchParams = new URLSearchParams(url.search);

export default {
  dialect: "postgresql",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    host: url.hostname || "localhost",
    port: url.port ? Number(url.port) : 5432,
    user: url.username || "postgres",
    password: url.password || "",
    database: url.pathname.replace("/", "") || "postgres",
    ssl: searchParams.get("sslmode") === "require" || true,
  },
  // Optional: Add this to control migration behavior
  migrations: {
    table: "migrations", // Default table for tracking migrations
    schema: "public",
  },
} satisfies Config;