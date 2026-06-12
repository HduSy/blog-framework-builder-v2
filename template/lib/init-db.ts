import { neon } from "@neondatabase/serverless";

// `site` is a fixed column name shared by all sites that use this template;
// it is NOT a placeholder. Do not replace it with the per-site identifier —
// the per-site value is held in lib/db.ts (`const SITE = "..."`) and used at
// query time as `WHERE site = ${SITE}`.
async function init() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const sql = neon(databaseUrl);
  await sql`ALTER TABLE articles ADD COLUMN IF NOT EXISTS body TEXT`;
  await sql`CREATE INDEX IF NOT EXISTS idx_articles_site_short_title ON articles(site, short_title)`;

  await sql`CREATE TABLE IF NOT EXISTS authors (
    id BIGSERIAL PRIMARY KEY,
    site VARCHAR NOT NULL,
    name VARCHAR NOT NULL,
    slug VARCHAR NOT NULL,
    img VARCHAR,
    description TEXT,
    language VARCHAR,
    UNIQUE(site, slug)
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_authors_site_slug ON authors(site, slug)`;
  console.log("Schema OK: articles + authors tables ensured.");
}

init().catch((e) => {
  console.error(e);
  process.exit(1);
});
