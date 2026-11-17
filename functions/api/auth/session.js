import { hasValidSession, jsonResponse, loginConfigured } from "../../_lib/auth.js";

export async function onRequestGet({ request, env }) {
  return jsonResponse({ configured: loginConfigured(env), authenticated: await hasValidSession(request, env) });
}
