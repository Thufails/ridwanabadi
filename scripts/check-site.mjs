import { readFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const warnings = [];
const logFailure = (message) => failures.push(message);
const logWarning = (message) => warnings.push(message);

async function exists(relativePath) {
  const resolved = path.resolve(root, relativePath);
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return false;
  try {
    await access(resolved);
    return true;
  } catch {
    return false;
  }
}

function normalizeLocalReference(value) {
  return value.replaceAll("&amp;", "&").trim();
}

async function checkStaticReference(value, sourceFile, context) {
  const reference = normalizeLocalReference(value);
  if (!reference || /^(?:https?:|mailto:|tel:|data:|javascript:)/i.test(reference)) return;
  if (reference.startsWith("#")) {
    const sourceHtml = await readFile(path.join(root, sourceFile), "utf8");
    const anchor = decodeURIComponent(reference.slice(1));
    const idPattern = new RegExp(`(?:id|name)=["']${anchor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["]`, "i");
    if (!idPattern.test(sourceHtml)) logFailure(`${sourceFile}: anchor ${reference} tidak ditemukan (${context}).`);
    return;
  }

  let url;
  try {
    url = new URL(reference, `https://local.invalid/${sourceFile.replaceAll("\\", "/")}`);
  } catch {
    logFailure(`${sourceFile}: URL ${reference} tidak valid (${context}).`);
    return;
  }
  if (url.hostname !== "local.invalid") return;

  const pathname = decodeURIComponent(url.pathname).replace(/^\//, "");
  const targetPath = pathname ? path.posix.normalize(path.posix.join(path.posix.dirname(sourceFile.replaceAll("\\", "/")), pathname)) : sourceFile;
  if (!(await exists(targetPath))) {
    logFailure(`${sourceFile}: file ${reference} tidak ditemukan (${context}).`);
    return;
  }
  if (url.hash && targetPath.endsWith(".html")) {
    const targetHtml = await readFile(path.join(root, targetPath), "utf8");
    const anchor = decodeURIComponent(url.hash.slice(1));
    const idPattern = new RegExp(`(?:id|name)=["']${anchor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`, "i");
    if (!idPattern.test(targetHtml)) logFailure(`${sourceFile}: target ${reference} tidak memiliki anchor yang cocok.`);
  }
}

try {
  const archive = JSON.parse(await readFile(path.join(root, "data", "articles.json"), "utf8"));
  if (!Array.isArray(archive.articles)) throw new Error("data/articles.json harus memiliki array articles.");

  const allSlugs = new Set();
  const publishedSlugs = new Set();
  const visibleArticles = archive.articles.filter((article) => article.status !== "draft");
  for (const article of archive.articles) {
    const label = article.slug || article.title || "artikel tanpa identitas";
    if (!article.title?.trim()) logFailure(`${label}: judul kosong.`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(article.slug || "")) logFailure(`${label}: slug tidak valid.`);
    if (allSlugs.has(article.slug)) logFailure(`${label}: slug duplikat.`);
    allSlugs.add(article.slug);
    if (article.status && !["draft", "published"].includes(article.status)) logFailure(`${label}: status harus draft atau published.`);
    if (article.status !== "draft") publishedSlugs.add(article.slug);
    if (!article.date || Number.isNaN(new Date(article.date).valueOf())) logFailure(`${label}: tanggal tidak valid.`);
    if (!article.excerpt?.trim()) logFailure(`${label}: ringkasan kosong.`);
    if (!article.content?.trim()) logFailure(`${label}: isi artikel kosong.`);
    if (article.tags && !Array.isArray(article.tags)) logFailure(`${label}: tags harus berupa array.`);

    for (const imagePath of new Set([article.featuredImage, article.coverImage].filter(Boolean))) {
      if (/^https?:/i.test(imagePath)) {
        logWarning(`${label}: sampul masih memakai URL eksternal (${imagePath}).`);
      } else if (!(await exists(imagePath))) {
        logFailure(`${label}: aset sampul ${imagePath} tidak ditemukan.`);
      }
    }

    for (const [, source] of article.content.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) {
      const reference = normalizeLocalReference(source);
      if (/^https?:\/\//i.test(reference)) {
        const host = new URL(reference).hostname.toLowerCase();
        if (host === "ridwanabadi.com" || host.endsWith(".ridwanabadi.com")) {
          logWarning(`${label}: gambar isi masih mengambil dari WordPress (${reference}).`);
        }
      } else if (!(await exists(reference))) {
        logFailure(`${label}: gambar isi ${reference} tidak ditemukan.`);
      }
    }

    for (const [, href] of article.content.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)) {
      const reference = normalizeLocalReference(href);
      if (/^https?:\/\//i.test(reference)) {
        const url = new URL(reference);
        if (url.hostname === "ridwanabadi.com" || url.hostname.endsWith(".ridwanabadi.com")) {
          const targetSlug = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() || "");
          if (targetSlug && allSlugs.has(targetSlug)) continue;
          logWarning(`${label}: tautan lama tidak memiliki padanan artikel lokal (${reference}).`);
        }
        continue;
      }
      const articleLink = reference.match(/(?:^|\/)baca-artikel\.html\?slug=([^&#]+)/i);
      if (articleLink && !publishedSlugs.has(decodeURIComponent(articleLink[1]))) {
        logFailure(`${label}: tautan artikel lokal ${reference} tidak mengarah ke artikel terbit.`);
      }
    }
  }

  if (Number.isFinite(Number(archive.total)) && Number(archive.total) !== visibleArticles.length) {
    logWarning(`metadata total (${archive.total}) berbeda dari jumlah artikel terbit (${visibleArticles.length}).`);
  }

  const htmlFiles = ["index.html", "artikel.html", "baca-artikel.html", "galeri.html", "kelola-artikel.html"];
  const localSiteSlugs = publishedSlugs;
  for (const file of htmlFiles) {
    const html = await readFile(path.join(root, file), "utf8");
    for (const [, href] of html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)) {
      const reference = normalizeLocalReference(href);
      const articleLink = reference.match(/(?:^|\/)baca-artikel\.html\?slug=([^&#]+)/i);
      if (articleLink && !localSiteSlugs.has(decodeURIComponent(articleLink[1]))) {
        logFailure(`${file}: tautan ${reference} tidak mengarah ke artikel terbit.`);
      } else {
        await checkStaticReference(reference, file, "tautan");
      }
    }
    for (const [, source] of html.matchAll(/<(?:script|img)\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) {
      await checkStaticReference(source, file, "resource");
    }
    for (const [, href] of html.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)) {
      await checkStaticReference(href, file, "stylesheet");
    }
  }

  console.log(`Diperiksa ${archive.articles.length} artikel (${visibleArticles.length} terbit, ${archive.articles.length - visibleArticles.length} draf) dan ${htmlFiles.length} halaman.`);
  for (const warning of warnings) console.warn(`PERINGATAN: ${warning}`);
  for (const failure of failures) console.error(`GAGAL: ${failure}`);
  if (failures.length) process.exitCode = 1;
  else console.log(`LULUS: tidak ada masalah struktur artikel, aset lokal, atau tautan internal.`);
} catch (error) {
  console.error(`Pemeriksaan situs gagal: ${error.message}`);
  process.exitCode = 1;
}
