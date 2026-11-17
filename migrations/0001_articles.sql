CREATE TABLE IF NOT EXISTS articles (
  slug TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('draft', 'published')),
  date TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  article_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_articles_status_date ON articles(status, date DESC);
