import { jsonResponse } from "../_lib/auth.js";
import { listStoredArticles } from "../_lib/articles.js";

export async function onRequestGet({ env }) {
  try {
    const articles = await listStoredArticles(env);
    return jsonResponse({ articles: articles.map((article) => ({ ...article, excerpt: article.excerpt || article.summary || "" })) }, 200, { "Cache-Control": "public, max-age=60, s-maxage=300" });
  } catch (error) {
    return jsonResponse({ articles: [], unavailable: true });
  }
}
