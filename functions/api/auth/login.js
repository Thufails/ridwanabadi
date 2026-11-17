import { createSessionCookie, hasSameOrigin, jsonResponse, loginConfigured, safeEqual } from "../../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  if (!hasSameOrigin(request)) return jsonResponse({ error: "Permintaan ditolak." }, 403);
  if (!loginConfigured(env)) return jsonResponse({ error: "Login admin belum disiapkan di Cloudflare." }, 503);
  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: "Format permintaan tidak valid." }, 400); }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (email.length > 254 || password.length > 256 || !email || !password) return jsonResponse({ error: "Email atau kata sandi belum benar." }, 400);
  if (!safeEqual(email, env.ADMIN_EMAIL.trim().toLowerCase()) || !safeEqual(password, env.ADMIN_PASSWORD)) return jsonResponse({ error: "Email atau kata sandi salah." }, 401);
  return jsonResponse({ authenticated: true }, 200, { "Set-Cookie": await createSessionCookie(request, env) });
}

export function onRequest(context) {
  return context.request.method === "OPTIONS" ? new Response(null, { status: 204 }) : jsonResponse({ error: "Metode tidak diizinkan." }, 405, { Allow: "POST" });
}
