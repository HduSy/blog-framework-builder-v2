import { neon, NeonQueryFunction } from "@neondatabase/serverless";

let _sql: NeonQueryFunction<false, false> | null = null;
function getSql(): NeonQueryFunction<false, false> {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    _sql = neon(url);
  }
  return _sql;
}

// production:replace with {site}
const SITE = "{site}";

export interface Article {
  id: number;
  site: string | null;
  type: string | null;
  short_title: string | null;
  language: string | null;
  published_time: string | null;
  modified_time: string | null;
  author: string | null;
  img: string | null;
  title: string | null;
  description: string | null;
  url: string | null;
  body: string | null;
}

export async function getArticleBySlug(
  slug: string
): Promise<Article | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM articles
    WHERE site = ${SITE} AND short_title = ${slug}
    LIMIT 1
  `;
  return (rows[0] as Article) ?? null;
}

export async function getAllArticles(): Promise<Article[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT id, site, type, short_title, language, published_time, modified_time,
           author, img, title, description, url
    FROM articles
    WHERE site = ${SITE}
    ORDER BY published_time DESC NULLS LAST, id DESC
  `;
  return rows as Article[];
}

export async function getRelatedArticles(currentId: number, type: string): Promise<Article[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT id, site, type, short_title, title, img
    FROM articles
    WHERE site = ${SITE} AND type = ${type} AND id != ${currentId}
    ORDER BY RANDOM()
    LIMIT 10
  `;
  return rows as Article[];
}

export async function getArticlesByType(type: string): Promise<Article[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT id, site, type, short_title, language, published_time, modified_time,
           author, img, title, description, url
    FROM articles
    WHERE site = ${SITE} AND type = ${type}
    ORDER BY modified_time DESC NULLS LAST, id DESC
  `;
  return rows as Article[];
}

export interface Author {
  id: number;
  site: string | null;
  name: string | null;
  slug: string | null;
  img: string | null;
  description: string | null;
  language: string | null;
}

export async function getAuthorBySlug(slug: string): Promise<Author | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM authors
    WHERE site = ${SITE} AND slug = ${slug}
    LIMIT 1
  `;
  return (rows[0] as Author) ?? null;
}

export async function getAllAuthors(): Promise<Author[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM authors
    WHERE site = ${SITE}
    ORDER BY id
  `;
  return rows as Author[];
}

export async function upsertAuthor(input: {
  name: string;
  slug: string;
  img?: string | null;
  description?: string | null;
  language?: string | null;
}): Promise<Author> {
  const sql = getSql();
  const { name, slug, img = null, description = null, language = null } = input;

  const existing = await sql`
    SELECT id FROM authors WHERE site = ${SITE} AND slug = ${slug} LIMIT 1
  `;

  if (existing[0]) {
    const rows = await sql`
      UPDATE authors SET
        name = ${name}, img = ${img}, description = ${description}, language = ${language}
      WHERE site = ${SITE} AND slug = ${slug}
      RETURNING *
    `;
    return rows[0] as Author;
  }

  const rows = await sql`
    INSERT INTO authors (site, name, slug, img, description, language)
    VALUES (${SITE}, ${name}, ${slug}, ${img}, ${description}, ${language})
    RETURNING *
  `;
  return rows[0] as Author;
}

export async function upsertArticle(input: {
  short_title: string;
  title: string;
  body: string;
  description?: string | null;
  type?: string | null;
  language?: string | null;
  author?: string | null;
  img?: string | null;
  url?: string | null;
  published_time?: string | null;
}): Promise<Article> {
  const sql = getSql();
  const {
    short_title,
    title,
    body,
    description = null,
    type = null,
    language = null,
    author = null,
    img = null,
    url = null,
    published_time = null,
  } = input;

  const existing = await sql`
    SELECT id FROM articles WHERE site = ${SITE} AND short_title = ${short_title} LIMIT 1
  `;

  if (existing[0]) {
    const rows = await sql`
      UPDATE articles SET
        title = ${title},
        body = ${body},
        description = ${description},
        type = ${type},
        language = ${language},
        author = ${author},
        img = ${img},
        url = ${url},
        published_time = ${published_time},
        modified_time = NOW()
      WHERE site = ${SITE} AND short_title = ${short_title}
      RETURNING *
    `;
    return rows[0] as Article;
  }

  const rows = await sql`
    INSERT INTO articles (
      site, short_title, title, body, description, type, language,
      author, img, url, published_time, modified_time
    ) VALUES (
      ${SITE}, ${short_title}, ${title}, ${body}, ${description}, ${type}, ${language},
      ${author}, ${img}, ${url}, ${published_time}, NOW()
    )
    RETURNING *
  `;
  return rows[0] as Article;
}
