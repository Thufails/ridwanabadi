const encoder = new TextEncoder();
const SESSION_SECONDS = 8 * 60 * 60;

function cookieName(request) {
  return new URL(request.url).protocol === "https:" ? "__Host-ridwan_admin" : "ridwan_admin_dev";
}

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64 + "=".repeat((4 - base64.length % 4) % 4)), (char) => char.charCodeAt(0));
}

function readCookie(request) {
  const name = cookieName(request);
  const entry = (request.headers.get("Cookie") || "").split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return entry ? entry.slice(name.length + 1) : "";
}

async function sessionKey(secret, usages) {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, usages);
}

export function loginConfigured(env) {
  return Boolean(env.ADMIN_EMAIL && env.ADMIN_PASSWORD && env.ADMIN_PASSWORD.length >= 8 && env.ADMIN_SESSION_SECRET && env.ADMIN_SESSION_SECRET.length >= 32);
}

export function safeEqual(left, right) {
  const a = encoder.encode(String(left));
  const b = encoder.encode(String(right));
  let mismatch = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) mismatch |= (a[i] || 0) ^ (b[i] || 0);
  return mismatch === 0;
}

export async function createSessionCookie(request, env) {
  const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const payload = `v1.${expires}`;
  const signature = await crypto.subtle.sign("HMAC", await sessionKey(env.ADMIN_SESSION_SECRET, ["sign"]), encoder.encode(payload));
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${cookieName(request)}=${payload}.${base64Url(new Uint8Array(signature))}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_SECONDS}${secure}`;
}

export function clearSessionCookie(request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${cookieName(request)}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}

export async function hasValidSession(request, env) {
  if (!loginConfigured(env)) return false;
  const [version, expiresText, signatureText, extra] = readCookie(request).split(".");
  const expires = Number(expiresText);
  if (version !== "v1" || !signatureText || extra || !Number.isSafeInteger(expires) || expires <= Math.floor(Date.now() / 1000)) return false;
  try {
    return await crypto.subtle.verify("HMAC", await sessionKey(env.ADMIN_SESSION_SECRET, ["verify"]), fromBase64Url(signatureText), encoder.encode(`${version}.${expires}`));
  } catch {
    return false;
  }
}

export function jsonResponse(data, status = 200, headers = {}) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

export function hasSameOrigin(request) {
  const origin = request.headers.get("Origin");
  return !origin || origin === new URL(request.url).origin;
}
