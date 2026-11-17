import { apiError, normalizeArticle, readJson, requireDatabase, storeArticle } from "../../../_lib/articles.js";
import { hasSameOrigin, jsonResponse } from "../../../_lib/auth.js";

export async function onRequestPut({ request, env, params }) {
  if (!hasSameOrigin(request)) return jsonResponse({ error: "Permintaan ditolak." }, 403);
  try {
    const slug = String(params.slug || "");
    const db = requireDatabase(env);
    const row = await db.prepare("SELECT article_json FROM articles WHERE slug = ?").bind(slug).first();
    const existing = row ? JSON.parse(row.article_json) : null;
    const payload = await readJson(request);
    if (payload.slug !== slug) return jsonResponse({ error: "Alamat artikel yang sedang diedit tidak dapat diubah." }, 400);
    const article = normalizeArticle(payload, existing);
    await storeArticle(env, article);
    return jsonResponse({ ok: true, ...article });
  } catch (error) { return apiError(error); }
}

export async function onRequestDelete({ request, env, params }) {
  if (!hasSameOrigin(request)) return jsonResponse({ error: "Permintaan ditolak." }, 403);
  try {
    const db = requireDatabase(env);
    const row = await db.prepare("SELECT status FROM articles WHERE slug = ?").bind(String(params.slug || "")).first();
    if (!row) return jsonResponse({ error: "Artikel tidak ditemukan." }, 404);
    if (row.status === "published") return jsonResponse({ error: "Ubah status menjadi draf sebelum menghapus artikel terbit." }, 409);
    await db.prepare("DELETE FROM articles WHERE slug = ?").bind(String(params.slug || "")).run();
    return jsonResponse({ deleted: true });
  } catch (error) { return apiError(error); }
}

export function onRequest(context) {
  if (context.request.method === "OPTIONS") return new Response(null, { status: 204 });
  return jsonResponse({ error: "Metode tidak diizinkan." }, 405, { Allow: "PUT, DELETE" });
}
