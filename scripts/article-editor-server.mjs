import { createServer } from "node:http";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { createHmac, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const projectRoot = path.resolve(process.env.ARTICLE_EDITOR_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));
const archivePath = path.join(projectRoot, "data", "articles.json");
const assetsPath = path.join(projectRoot, "assets", "articles");
const host = "127.0.0.1";
const port = Number(process.env.ARTICLE_EDITOR_PORT || 4174);
const maxRequestBytes = 7 * 1024 * 1024;
const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"], [".css", "text/css; charset=utf-8"], [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"], [".jpg", "image/jpeg"], [".jpeg", "image/jpeg"], [".png", "image/png"],
  [".webp", "image/webp"], [".svg", "image/svg+xml"], [".ico", "image/x-icon"]
]);
const localVarsPath = path.join(projectRoot, ".dev.vars");
const localSessionSeconds = 8 * 60 * 60;

try {
  const localVars = await readFile(localVarsPath, "utf8");
  for (const line of localVars.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^(["'])(.*)\1$/, "$2");
  }
} catch {
  // Local credentials can also be supplied by the process environment.
}

function loginConfigured() {
  return Boolean(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD?.length >= 8 && process.env.ADMIN_SESSION_SECRET?.length >= 32);
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  const size = Math.max(a.length, b.length, 1);
  const paddedA = Buffer.alloc(size);
  const paddedB = Buffer.alloc(size);
  a.copy(paddedA);
  b.copy(paddedB);
  return timingSafeEqual(paddedA, paddedB) && a.length === b.length;
}

function signSession(payload) {
  return createHmac("sha256", process.env.ADMIN_SESSION_SECRET).update(payload).digest("base64url");
}

function sessionCookie(request, clear = false) {
  const secure = new URL(request.url || "/", `http://${host}:${port}`).protocol === "https:" ? "; Secure" : "";
  if (clear) return `ridwan_admin_local=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
  const expires = Math.floor(Date.now() / 1000) + localSessionSeconds;
  const payload = `v1.${expires}`;
  return `ridwan_admin_local=${payload}.${signSession(payload)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${localSessionSeconds}${secure}`;
}

function hasLocalSession(request) {
  if (!loginConfigured()) return false;
  const token = (request.headers.cookie || "").split(";").map((part) => part.trim()).find((part) => part.startsWith("ridwan_admin_local="))?.slice("ridwan_admin_local=".length) || "";
  const [version, expiresText, signature, extra] = token.split(".");
  const expires = Number(expiresText);
  return version === "v1" && Boolean(signature) && !extra && Number.isSafeInteger(expires)
    && expires > Math.floor(Date.now() / 1000) && safeEqual(signature, signSession(`${version}.${expires}`));
}

function sendJson(response, statusCode, value, extraHeaders = {}) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    ...extraHeaders
  });
  response.end(JSON.stringify(value));
}

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxRequestBytes) throw Object.assign(new Error("Data artikel terlalu besar."), { statusCode: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("Format data artikel tidak valid."), { statusCode: 400 });
  }
}

function safeImage(dataUrl, slug, replaceExisting = false) {
  if (!dataUrl) return null;
  const match = /^data:image\/(jpeg|png|webp);base64,([a-z\d+/]+=*)$/i.exec(dataUrl);
  if (!match) throw Object.assign(new Error("Sampul harus berupa JPG, PNG, atau WebP."), { statusCode: 400 });
  const type = match[1].toLowerCase();
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw Object.assign(new Error("Ukuran gambar maksimal 5 MB."), { statusCode: 400 });

  const signatures = {
    jpeg: bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
    png: bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    webp: bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP"
  };
  if (!signatures[type]) throw Object.assign(new Error("Isi file tidak cocok dengan format gambar."), { statusCode: 400 });

  const extension = type === "jpeg" ? "jpg" : type;
  const suffix = replaceExisting ? `-${randomUUID().slice(0, 8)}` : "";
  return { bytes, relativePath: `assets/articles/${slug}${suffix}.${extension}` };
}

async function saveArchive(archive) {
  const temporaryPath = `${archivePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(archive, null, 2)}\n`, "utf8");
    await rename(temporaryPath, archivePath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => {});
    throw error;
  }
}

async function saveArticle(request, response) {
  const origin = request.headers.origin;
  const requestHost = request.headers.host || "";
  if (origin && ![`http://${host}:${port}`, `http://localhost:${port}`].includes(origin)) {
    return sendJson(response, 403, { error: "Permintaan hanya boleh berasal dari editor lokal." });
  }
  if (!new Set([`${host}:${port}`, `localhost:${port}`]).has(requestHost)) {
    return sendJson(response, 403, { error: "Host permintaan tidak valid." });
  }
  if (!String(request.headers["content-type"] || "").startsWith("application/json")) {
    return sendJson(response, 415, { error: "Data harus dikirim dalam format JSON." });
  }

  let uploadedCover;
  let coverWritten = false;
  try {
    const payload = await readJsonBody(request);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return sendJson(response, 400, { error: "Data artikel tidak valid." });
    }
    const title = String(payload.title || "").trim();
    const existingSlug = request.method === "PUT" ? request.existingArticleSlug : "";
    const slug = existingSlug || slugify(payload.slug || title);
    const date = String(payload.date || "");
    const category = String(payload.category || "Artikel").trim().slice(0, 80) || "Artikel";
    const excerpt = String(payload.excerpt || payload.summary || String(payload.content || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;/g, " "))
      .replace(/\s+/g, " ").trim().slice(0, 320);
    const content = String(payload.content || "").trim();
    const tagSource = Array.isArray(payload.tags) ? payload.tags : payload.topics;
    const tags = Array.isArray(tagSource) ? tagSource.map((tag) => String(tag).trim().slice(0, 60)).filter(Boolean).slice(0, 20) : [];
    const status = String(payload.status || "published");

    if (!title || title.length > 180) return sendJson(response, 400, { error: "Judul wajib diisi (maksimal 180 karakter)." });
    if (!slug || slug.length > 180 || slug !== slugify(slug)) return sendJson(response, 400, { error: "Alamat artikel tidak valid." });
    const parsedDate = new Date(`${date}T12:00:00+07:00`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsedDate.valueOf()) || parsedDate.toISOString().slice(0, 10) !== date) {
      return sendJson(response, 400, { error: "Tanggal artikel tidak valid." });
    }
    if (!excerpt) return sendJson(response, 400, { error: "Ringkasan artikel belum tersedia." });
    if (!["draft", "published"].includes(status)) return sendJson(response, 400, { error: "Status artikel tidak valid." });
    if (!content || content.replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;/g, " ").trim().length < 1) {
      return sendJson(response, 400, { error: "Isi artikel wajib diisi." });
    }

    const archive = JSON.parse(await readFile(archivePath, "utf8"));
    if (!Array.isArray(archive.articles)) throw new Error("Arsip artikel tidak memiliki format yang benar.");
    const existingArticle = existingSlug
      ? archive.articles.find((article) => article.slug?.toLowerCase() === existingSlug.toLowerCase())
      : null;
    if (existingSlug && !existingArticle) return sendJson(response, 404, { error: "Artikel yang akan diubah tidak ditemukan." });
    if (archive.articles.some((article) => article.slug?.toLowerCase() === slug.toLowerCase() && article !== existingArticle)) {
      return sendJson(response, 409, { error: "Alamat artikel ini sudah ada. Ubah slug agar tetap unik." });
    }

    uploadedCover = safeImage(payload.coverDataUrl, slug, Boolean(existingArticle));
    if (uploadedCover) {
      await mkdir(assetsPath, { recursive: true });
      await writeFile(path.join(projectRoot, uploadedCover.relativePath), uploadedCover.bytes, { flag: "wx" });
      coverWritten = true;
    }

    const article = {
      ...(existingArticle || {}),
      id: existingArticle?.id ?? archive.articles.reduce((maximum, entry) => Math.max(maximum, Number(entry.id) || 0), 0) + 1,
      date: new Date(`${date}T12:00:00+07:00`).toISOString(),
      slug,
      sourceType: existingArticle?.sourceType || "local",
      sourceUrl: existingArticle?.sourceUrl || "",
      title,
      excerpt,
      summary: String(payload.summary || excerpt).trim().slice(0, 240),
      description: String(payload.description || "").trim().slice(0, 200),
      category,
      tags,
      topics: Array.isArray(payload.topics) ? payload.topics.map((topic) => String(topic).trim()).filter(Boolean).slice(0, 30) : tags,
      status,
      featuredImage: uploadedCover?.relativePath || (payload.removeCover ? null : existingArticle?.featuredImage || existingArticle?.coverImage || null),
      coverImage: uploadedCover?.relativePath || (payload.removeCover ? null : existingArticle?.coverImage || existingArticle?.featuredImage || null),
      content
    };

    if (existingArticle) {
      archive.articles[archive.articles.indexOf(existingArticle)] = article;
    } else {
      archive.articles.push(article);
    }
    archive.articles.sort((left, right) => new Date(right.date) - new Date(left.date));
    archive.total = archive.articles.filter((entry) => entry.status !== "draft").length;
    archive.updatedAt = new Date().toISOString();
    await saveArchive(archive);
    return sendJson(response, existingArticle ? 200 : 201, { ok: true, slug, status, coverImage: article.coverImage });
  } catch (error) {
    if (coverWritten && uploadedCover) await unlink(path.join(projectRoot, uploadedCover.relativePath)).catch(() => {});
    const statusCode = error.statusCode || 500;
    console.error(error);
    return sendJson(response, statusCode, { error: statusCode === 500 ? "Artikel tidak berhasil disimpan. Periksa arsip lokal dan coba lagi." : error.message });
  }
}

async function listArticles(request, response) {
  const requestHost = request.headers.host || "";
  const origin = request.headers.origin;
  if (!new Set([`${host}:${port}`, `localhost:${port}`]).has(requestHost)
    || (origin && ![`http://${host}:${port}`, `http://localhost:${port}`].includes(origin))) {
    return sendJson(response, 403, { error: "Endpoint hanya tersedia di editor lokal." });
  }
  try {
    const archive = JSON.parse(await readFile(archivePath, "utf8"));
    if (!Array.isArray(archive.articles)) throw new Error("Arsip artikel tidak memiliki format yang benar.");
    const articles = archive.articles.sort((left, right) => new Date(right.date) - new Date(left.date));
    return sendJson(response, 200, { articles });
  } catch (error) {
    console.error(error);
    return sendJson(response, 500, { error: "Arsip lokal tidak dapat dibaca." });
  }
}

async function deleteDraft(request, response, slug) {
  const origin = request.headers.origin;
  const requestHost = request.headers.host || "";
  if (!new Set([`${host}:${port}`, `localhost:${port}`]).has(requestHost)
    || (origin && ![`http://${host}:${port}`, `http://localhost:${port}`].includes(origin))) {
    return sendJson(response, 403, { error: "Permintaan hanya boleh berasal dari editor lokal." });
  }
  try {
    const archive = JSON.parse(await readFile(archivePath, "utf8"));
    const article = archive.articles.find((entry) => entry.slug === slug);
    if (!article) return sendJson(response, 404, { error: "Artikel tidak ditemukan." });
    if (article.status !== "draft") return sendJson(response, 409, { error: "Hanya draf yang dapat dihapus dari editor lokal." });
    archive.articles = archive.articles.filter((entry) => entry !== article);
    archive.total = archive.articles.filter((entry) => entry.status !== "draft").length;
    archive.updatedAt = new Date().toISOString();
    await saveArchive(archive);
    return sendJson(response, 200, { deleted: true });
  } catch (error) {
    console.error(error);
    return sendJson(response, 500, { error: "Draf tidak berhasil dihapus." });
  }
}

function hasLocalOrigin(request) {
  const origin = request.headers.origin;
  return !origin || [`http://${host}:${port}`, `http://localhost:${port}`].includes(origin);
}

async function serveStatic(request, response, pathname) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    response.writeHead(400).end("Bad request");
    return;
  }
  const requestedPath = decodedPath === "/" ? "/index.html" : decodedPath;
  const resolvedPath = path.resolve(projectRoot, `.${requestedPath}`);
  const relativePath = path.relative(projectRoot, resolvedPath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const contents = await readFile(resolvedPath);
    response.writeHead(200, {
      "content-type": mimeTypes.get(path.extname(resolvedPath).toLowerCase()) || "application/octet-stream",
      "cache-control": path.extname(resolvedPath) === ".json" ? "no-store" : "no-cache",
      "x-content-type-options": "nosniff"
    });
    response.end(request.method === "HEAD" ? undefined : contents);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("Not found");
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${host}:${port}`);
  const localHostAllowed = new Set([`${host}:${port}`, `localhost:${port}`]).has(request.headers.host || "");

  if (url.pathname === "/api/auth/session" && request.method === "GET") {
    return sendJson(response, 200, { configured: loginConfigured(), authenticated: hasLocalSession(request) });
  }
  if (url.pathname === "/api/auth/login" && request.method === "POST") {
    if (!localHostAllowed || !hasLocalOrigin(request)) return sendJson(response, 403, { error: "Permintaan login ditolak." });
    if (!loginConfigured()) return sendJson(response, 503, { error: "Akun lokal belum disiapkan. Isi .dev.vars terlebih dahulu." });
    try {
      const credentials = await readJsonBody(request);
      const email = String(credentials.email || "").trim().toLowerCase();
      const password = String(credentials.password || "");
      if (!safeEqual(email, process.env.ADMIN_EMAIL.trim().toLowerCase()) || !safeEqual(password, process.env.ADMIN_PASSWORD)) {
        return sendJson(response, 401, { error: "Email atau kata sandi salah." });
      }
      response.setHeader("Set-Cookie", sessionCookie(request));
      return sendJson(response, 200, { authenticated: true });
    } catch (error) {
      return sendJson(response, error.statusCode || 400, { error: error.message || "Format permintaan tidak valid." });
    }
  }
  if (url.pathname === "/api/auth/logout" && request.method === "POST") {
    if (!localHostAllowed || !hasLocalOrigin(request)) return sendJson(response, 403, { error: "Permintaan logout ditolak." });
    response.setHeader("Set-Cookie", sessionCookie(request, true));
    return sendJson(response, 200, { loggedOut: true });
  }

  const isAdminPage = url.pathname === "/admin" || url.pathname.startsWith("/admin/");
  const publicAdminPaths = new Set(["/admin/login", "/admin/login.html", "/admin/login.css", "/admin/login.js"]);
  const isAdminApi = url.pathname === "/api/admin" || url.pathname.startsWith("/api/admin/");
  const authenticated = hasLocalSession(request);
  if (isAdminApi && !authenticated) return sendJson(response, 401, { error: "Sesi login dibutuhkan." });
  if (isAdminPage && publicAdminPaths.has(url.pathname)) {
    if (authenticated && ["/admin/login", "/admin/login.html"].includes(url.pathname)) {
      response.writeHead(302, { Location: "/admin/" }).end();
      return;
    }
  } else if (isAdminPage && !authenticated) {
    const destination = url.pathname + url.search;
    response.writeHead(302, { Location: `/admin/login.html?next=${encodeURIComponent(destination)}` }).end();
    return;
  }

  if (url.pathname === "/admin/login") url.pathname = "/admin/login.html";
  if (url.pathname === "/admin" || url.pathname === "/admin/") url.pathname = "/admin/index.html";
  if (url.pathname === "/api/admin/articles" && request.method === "GET") return listArticles(request, response);
  if (url.pathname === "/api/admin/articles" && request.method === "POST") return saveArticle(request, response);
  if (url.pathname.startsWith("/api/admin/articles/")) {
    let slug;
    try { slug = decodeURIComponent(url.pathname.slice("/api/admin/articles/".length)); }
    catch { return sendJson(response, 400, { error: "Alamat artikel tidak valid." }); }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return sendJson(response, 400, { error: "Alamat artikel tidak valid." });
    if (request.method === "PUT") {
      request.existingArticleSlug = slug;
      return saveArticle(request, response);
    }
    if (request.method === "DELETE") return deleteDraft(request, response, slug);
    return sendJson(response, 405, { error: "Metode tidak diizinkan." }, { allow: "PUT, DELETE" });
  }
  if (url.pathname === "/api/articles" && request.method === "GET") return listArticles(request, response);
  if (url.pathname.startsWith("/api/")) return sendJson(response, 404, { error: "Endpoint tidak ditemukan." });
  if (!new Set(["GET", "HEAD"]).has(request.method)) {
    response.writeHead(405, { allow: "GET, HEAD, POST" }).end("Method not allowed");
    return;
  }
  await serveStatic(request, response, url.pathname);
});

server.listen(port, host, () => {
  console.log(`Login admin lokal: http://${host}:${port}/admin/login.html`);
  console.log("Server lokal hanya mendengarkan di komputer ini; hentikan dengan Ctrl+C.");
});

server.on("error", (error) => {
  console.error(error.code === "EADDRINUSE" ? `Port ${port} sedang digunakan. Atur ARTICLE_EDITOR_PORT untuk memilih port lain.` : error);
  process.exitCode = 1;
});
