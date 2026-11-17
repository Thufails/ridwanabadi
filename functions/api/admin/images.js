import { jsonResponse } from "../../_lib/auth.js";

const types = new Map([["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"]]);

export async function onRequestPost({ request, env }) {
  if (!env.ARTICLE_IMAGES) return jsonResponse({ error: "Penyimpanan gambar belum dihubungkan di Cloudflare." }, 503);
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file.arrayBuffer !== "function") return jsonResponse({ error: "Pilih foto sampul terlebih dahulu." }, 400);
    const extension = types.get(file.type);
    if (!extension) return jsonResponse({ error: "Gunakan gambar JPG, PNG, atau WebP." }, 400);
    if (file.size < 1 || file.size > 5 * 1024 * 1024) return jsonResponse({ error: "Ukuran gambar maksimal 5 MB." }, 400);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const valid = extension === "jpg" ? bytes[0] === 0xff && bytes[1] === 0xd8
      : extension === "png" ? bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
      : String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
    if (!valid) return jsonResponse({ error: "Isi foto tidak sesuai dengan format file." }, 400);
    const key = `${crypto.randomUUID()}.${extension}`;
    await env.ARTICLE_IMAGES.put(key, bytes, { httpMetadata: { contentType: file.type } });
    return jsonResponse({ key, coverImage: `/api/article-image/${key}` }, 201);
  } catch (error) {
    return jsonResponse({ error: "Foto sampul gagal disimpan." }, 500);
  }
}

export function onRequest(context) {
  return context.request.method === "OPTIONS" ? new Response(null, { status: 204 }) : jsonResponse({ error: "Metode tidak diizinkan." }, 405, { Allow: "POST" });
}
