import { apiError, listStoredArticles, normalizeArticle, readJson, requireDatabase, storeArticle } from "../../_lib/articles.js";
import { hasSameOrigin, jsonResponse } from "../../_lib/auth.js";

export async function onRequestGet({ env }) {
  try { return jsonResponse({ articles: await listStoredArticles(env, true) }); }
  catch (error) { return apiError(error); }
}

export async function onRequestPost({ request, env }) {
  if (!hasSameOrigin(request)) return jsonResponse({ error: "Permintaan ditolak." }, 403);
  try {
    const payload = await readJson(request);
    const article = normalizeArticle(payload);
    const db = requireDatabase(env);
    const exists = await db.prepare("SELECT slug FROM articles WHERE slug = ?").bind(article.slug).first();
    if (exists) return jsonResponse({ error: "Slug artikel sudah digunakan." }, 409);
    await storeArticle(env, article);
    return jsonResponse({ ok: true, ...article }, 201);
  } catch (error) { return apiError(error); }
}

export function onRequest(context) {
  if (context.request.method === "OPTIONS") return new Response(null, { status: 204 });
  return jsonResponse({ error: "Metode tidak diizinkan." }, 405, { Allow: "GET, POST" });
}
