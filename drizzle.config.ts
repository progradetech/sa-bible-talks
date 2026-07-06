import { defineConfig } from 'drizzle-kit';

// drizzle-kit introspects with concurrent queries, which the Supabase
// transaction pooler (port 6543) cross-wires — push crashes mid-pull.
// Tooling connects through the session pooler (port 5432) instead; the
// app keeps using the transaction pooler from DATABASE_URL as-is.
function sessionPoolerUrl(url: string): string {
  const u = new URL(url);
  if (u.hostname.endsWith('.pooler.supabase.com') && u.port === '6543') {
    u.port = '5432';
  }
  return u.toString();
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: sessionPoolerUrl(process.env.DATABASE_URL!),
  },
  strict: true,
  verbose: true,
});
