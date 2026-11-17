export async function onRequestGet({ params, env }) {
  if (!env.ARTICLE_IMAGES) return new Response("Not found", { status: 404 });
  const key = String(params.key || "");
  if (!/^[a-f0-9-]{36}\.(?:jpg|png|webp)$/.test(key)) return new Response("Not found", { status: 404 });
  const image = await env.ARTICLE_IMAGES.get(key);
  if (!image) return new Response("Not found", { status: 404 });
  const headers = new Headers({ "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" });
  image.writeHttpMetadata(headers);
  return new Response(image.body, { headers });
}
