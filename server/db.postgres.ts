import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from "@shared/schema";
import pkg from 'pg';
const { Pool } = pkg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Create postgres connection for Drizzle ORM
export const sql = postgres(process.env.DATABASE_URL);
export const db = drizzle(sql, { schema });

// Create a proper pg Pool for session storage
// This is important because connect-pg-simple expects a standard pg Pool
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Create session table if it doesn't exist
pool.query(`
  CREATE TABLE IF NOT EXISTS "session" (
    "sid" varchar NOT NULL PRIMARY KEY,
    "sess" json NOT NULL,
    "expire" timestamp(6) NOT NULL
  )
`).then(() => {
  console.log("Session table created or verified");
}).catch(err => {
  console.error("Error creating session table:", err);
});