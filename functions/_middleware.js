import { hasValidSession, jsonResponse } from "./_lib/auth.js";

const loginPagePaths = new Set(["/admin/login", "/admin/login.html"]);
const publicAdminAssets = new Set([...loginPagePaths, "/admin/login.css", "/admin/login.js"]);

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const adminPage = url.pathname === "/admin" || url.pathname.startsWith("/admin/");
  const adminApi = url.pathname === "/api/admin" || url.pathname.startsWith("/api/admin/");
  if (!adminPage && !adminApi) return context.next();

  const authenticated = await hasValidSession(request, env);
  if (adminApi && !authenticated) return jsonResponse({ error: "Sesi login dibutuhkan." }, 401);
  if (adminPage && publicAdminAssets.has(url.pathname)) {
    if (loginPagePaths.has(url.pathname) && authenticated) return Response.redirect(new URL("/admin/", url), 302);
    return context.next();
  }
  if (!authenticated) {
    const loginUrl = new URL("/admin/login.html", url);
    loginUrl.searchParams.set("next", url.pathname + url.search);
    return Response.redirect(loginUrl, 302);
  }

  const response = await context.next();
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "same-origin");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
