import { clearSessionCookie, hasSameOrigin, jsonResponse } from "../../_lib/auth.js";

export async function onRequestPost({ request }) {
  if (!hasSameOrigin(request)) return jsonResponse({ error: "Permintaan ditolak." }, 403);
  return jsonResponse({ loggedOut: true }, 200, { "Set-Cookie": clearSessionCookie(request) });
}

export function onRequest(context) {
  return context.request.method === "OPTIONS" ? new Response(null, { status: 204 }) : jsonResponse({ error: "Metode tidak diizinkan." }, 405, { Allow: "POST" });
}
