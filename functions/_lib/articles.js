import { jsonResponse } from "./auth.js";

const allowedTags = new Set(["p", "br", "strong", "b", "em", "i", "u", "s", "h2", "h3", "ul", "ol", "li", "blockquote", "a", "hr"]);

export function requireDatabase(env) {
  if (!env.ARTICLES_DB) throw new Error("Database artikel belum dihubungkan di Cloudflare.");
  return env.ARTICLES_DB;
}

export function sanitizeArticleHtml(value) {
  return String(value || "").replace(/<!--[\s\S]*?-->/g, "").replace(/<\/?([a-z0-9]+)\b([^>]*)>/gi, (match, rawTag, attributes) => {
    const tag = rawTag.toLowerCase();
    if (!allowedTags.has(tag)) return "";
    if (/^\//.test(match.slice(1))) return `</${tag}>`;
    if (tag === "a") {
      const href = attributes.match(/\bhref\s*=\s*(["'])(.*?)\1/i)?.[2] || "";
      if (/^(https?:|mailto:)/i.test(href.trim())) return `<a href="${href.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}" rel="noopener noreferrer">`;
      return "<a>";
    }
    return ["br", "hr"].includes(tag) ? `<${tag}>` : `<${tag}>`;
  });
}

export async function readJson(request, maxBytes = 1_500_000) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > maxBytes) throw Object.assign(new Error("Ukuran data artikel terlalu besar."), { status: 413 });
  const text = await request.text();
  if (new TextEncoder().encode(text).length > maxBytes) throw Object.assign(new Error("Ukuran data artikel terlalu besar."), { status: 413 });
  try { return JSON.parse(text); } catch { throw Object.assign(new Error("Format data tidak valid."), { status: 400 }); }
}

export function normalizeArticle(input, existing = null) {
  const slug = String(input.slug || "").trim();
  const title = String(input.title || "").trim();
  const category = String(input.category || "Artikel").trim();
  const date = String(input.date || "").slice(0, 10);
  const status = String(input.status || "draft");
  const content = sanitizeArticleHtml(input.content);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 180) throw Object.assign(new Error("Alamat artikel tidak valid."), { status: 400 });
  if (!title || title.length > 120) throw Object.assign(new Error("Judul artikel wajib diisi (maksimal 120 karakter)."), { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) throw Object.assign(new Error("Tanggal artikel tidak valid."), { status: 400 });
  if (!category || category.length > 80) throw Object.assign(new Error("Kategori artikel wajib diisi."), { status: 400 });
  if (!content.replace(/<[^>]*>/g, " ").trim()) throw Object.assign(new Error("Isi artikel wajib diisi."), { status: 400 });
  if (!new Set(["draft", "published"]).has(status)) throw Object.assign(new Error("Status artikel tidak valid."), { status: 400 });
  const topics = Array.isArray(input.topics) ? input.topics.map((value) => String(value).trim()).filter(Boolean).slice(0, 30) : [];
  const article = {
    ...(existing || {}),
    id: existing?.id || crypto.randomUUID(), slug, title, category, date,
    summary: String(input.summary || "").trim().slice(0, 240),
    excerpt: String(input.summary || input.excerpt || "").trim().slice(0, 320),
    description: String(input.description || "").trim().slice(0, 200),
    topics,
    tags: topics,
    content,
    featured: false,
    status,
    coverImage: input.removeCover ? "" : String(input.coverImage || existing?.coverImage || "").slice(0, 500),
    featuredImage: input.removeCover ? "" : String(input.coverImage || existing?.featuredImage || "").slice(0, 500),
    updatedAt: new Date().toISOString(),
  };
  return article;
}

export function apiError(error) {
  const status = Number(error?.status) || 500;
  return jsonResponse({ error: status === 500 ? "Artikel tidak dapat disimpan sekarang." : error.message }, status);
}

export async function listStoredArticles(env, drafts = false) {
  const db = requireDatabase(env);
  const query = drafts
    ? "SELECT article_json FROM articles ORDER BY date DESC, updated_at DESC"
    : "SELECT article_json FROM articles WHERE status = 'published' ORDER BY date DESC";
  const result = await db.prepare(query).all();
  return (result.results || []).map((row) => JSON.parse(row.article_json));
}

export async function storeArticle(env, article) {
  const db = requireDatabase(env);
  await db.prepare("INSERT INTO articles (slug, status, date, updated_at, article_json) VALUES (?, ?, ?, ?, ?) ON CONFLICT(slug) DO UPDATE SET status=excluded.status, date=excluded.date, updated_at=excluded.updated_at, article_json=excluded.article_json")
    .bind(article.slug, article.status, article.date, article.updatedAt, JSON.stringify(article)).run();
}
