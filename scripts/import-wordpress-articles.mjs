import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const siteOrigin = "https://ridwanabadi.com";
const articlesDirectory = path.join(root, "data");
const imageDirectory = path.join(root, "assets", "articles");
const endpoint = new URL("/wp-json/wp/v2/posts", siteOrigin);
endpoint.searchParams.set("per_page", "100");
endpoint.searchParams.set("_embed", "wp:featuredmedia,wp:term");
endpoint.searchParams.set("_fields", "id,date,slug,link,title,content,excerpt,featured_media,categories,tags,_embedded");

await mkdir(articlesDirectory, { recursive: true });
await mkdir(imageDirectory, { recursive: true });

async function fetchPosts() {
  const posts = [];
  let page = 1;
  let pageCount = 1;

  do {
    const url = new URL(endpoint);
    url.searchParams.set("page", String(page));
    const response = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`WordPress API returned ${response.status} on page ${page}`);
    pageCount = Number(response.headers.get("x-wp-totalpages") || 1);
    posts.push(...await response.json());
    page += 1;
  } while (page <= pageCount);

  return posts;
}

function getAttribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return match ? (match[1] ?? match[2] ?? match[3] ?? "").replace(/&amp;/g, "&").replace(/&#0*38;/g, "&") : "";
}

function normalizeUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value, siteOrigin);
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
}

function preferredImageUrl(tag) {
  const candidates = [];
  const src = getAttribute(tag, "src");
  if (src) candidates.push({ url: src, width: 0 });

  const srcset = getAttribute(tag, "srcset");
  for (const entry of srcset.split(",")) {
    const [url, descriptor] = entry.trim().split(/\s+/, 2);
    if (url) candidates.push({ url, width: Number.parseInt(descriptor, 10) || 0 });
  }

  const widthsUnderTarget = candidates.filter((candidate) => candidate.width > 0 && candidate.width <= 1600);
  const chosen = widthsUnderTarget.sort((a, b) => b.width - a.width)[0] || candidates.sort((a, b) => b.width - a.width)[0];
  return chosen ? normalizeUrl(chosen.url) : "";
}

function featuredImageUrl(post) {
  const media = post._embedded?.["wp:featuredmedia"]?.[0];
  return normalizeUrl(media?.source_url || media?.media_details?.sizes?.large?.source_url || "");
}

function imageUrlsInPost(post) {
  const urls = new Set();
  const html = post.content?.rendered || "";
  for (const tag of html.match(/<img\b[^>]*>/gi) || []) {
    const url = preferredImageUrl(tag);
    if (url) urls.add(url);
  }
  const featured = featuredImageUrl(post);
  if (featured) urls.add(featured);
  return [...urls];
}

function isOwnedMedia(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === "ridwanabadi.com" || hostname.endsWith(".ridwanabadi.com");
  } catch {
    return false;
  }
}

function extensionFor(url, contentType) {
  const mime = (contentType || "").split(";")[0].trim().toLowerCase();
  const known = new Map([
    ["image/jpeg", ".jpg"], ["image/png", ".png"], ["image/webp", ".webp"],
    ["image/gif", ".gif"], ["image/avif", ".avif"], ["image/svg+xml", ".svg"]
  ]);
  if (known.has(mime)) return known.get(mime);
  const urlExtension = path.extname(new URL(url).pathname).toLowerCase();
  return /^\.(jpe?g|png|webp|gif|avif|svg)$/.test(urlExtension) ? urlExtension : ".jpg";
}

async function downloadImage(url) {
  if (!isOwnedMedia(url)) return null;
  const hash = createHash("sha1").update(url).digest("hex").slice(0, 14);
  const destinationRelative = `assets/articles/wp-${hash}${extensionFor(url, "")}`;
  const destination = path.join(root, destinationRelative);

  try {
    const existing = await stat(destination);
    if (existing.size > 0) return destinationRelative;
  } catch {
    // The asset does not exist yet.
  }

  const response = await fetch(url, {
    headers: { accept: "image/avif,image/webp,image/*,*/*;q=0.5" },
    signal: AbortSignal.timeout(90000)
  });
  if (!response.ok) throw new Error(`Image returned ${response.status}: ${url}`);
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("image/")) throw new Error(`Not an image (${contentType}): ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 20 * 1024 * 1024) throw new Error(`Image is over 20 MB: ${url}`);

  const finalRelative = `assets/articles/wp-${hash}${extensionFor(url, contentType)}`;
  await writeFile(path.join(root, finalRelative), bytes);
  return finalRelative;
}

function replaceAttribute(tag, name, value) {
  const pattern = new RegExp(`\\s${name}\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+)`, "i");
  const safeValue = value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  if (pattern.test(tag)) return tag.replace(pattern, ` ${name}="${safeValue}"`);
  return tag.replace(/\s*\/?>$/, (end) => ` ${name}="${safeValue}"${end}`);
}

function localizeImages(html, imageMap) {
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const remote = preferredImageUrl(tag);
    const local = imageMap.get(remote);
    if (!local) return tag;

    let localized = tag.replace(/\s+(?:srcset|sizes|data-src|data-lazy-src)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
    localized = replaceAttribute(localized, "src", local);
    localized = replaceAttribute(localized, "loading", "lazy");
    localized = replaceAttribute(localized, "decoding", "async");
    return localized;
  });
}

function plainText(html) {
  return (html || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(x[\da-f]+|\d+);/gi, (_, code) => {
      const value = code[0].toLowerCase() === "x" ? Number.parseInt(code.slice(1), 16) : Number.parseInt(code, 10);
      return Number.isFinite(value) && value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : "";
    })
    .replace(/&mdash;/gi, "—")
    .replace(/&ndash;/gi, "–")
    .replace(/&hellip;/gi, "…")
    .replace(/&rsquo;|&lsquo;/gi, "’")
    .replace(/&rdquo;|&ldquo;/gi, "”")
    .replace(/\s+/g, " ")
    .trim();
}

function categoryName(post) {
  const terms = post._embedded?.["wp:term"]?.flat() || [];
  const category = terms.find((term) => term.taxonomy === "category");
  if (category && category.name !== "Uncategorized") return category.name;
  if (/^nutrisi jiwa/i.test(plainText(post.title?.rendered))) return "Nutrisi Jiwa Series";
  return category?.name || "Artikel";
}

const posts = await fetchPosts();
if (!posts.length) throw new Error("WordPress API returned no public posts");

const imageUrls = [...new Set(posts.flatMap(imageUrlsInPost))];
const imageMap = new Map();
const failedImages = [];
for (let offset = 0; offset < imageUrls.length; offset += 4) {
  const batch = imageUrls.slice(offset, offset + 4);
  const downloaded = await Promise.all(batch.map(async (url) => {
    try {
      return [url, await downloadImage(url)];
    } catch (error) {
      failedImages.push({ url, message: error.message });
      return [url, null];
    }
  }));
  for (const [url, local] of downloaded) if (local) imageMap.set(url, local);
  console.log(`Fetched media ${Math.min(offset + batch.length, imageUrls.length)} / ${imageUrls.length}`);
}

const articles = posts.map((post) => {
  const featuredUrl = featuredImageUrl(post);
  const contentHtml = localizeImages(post.content?.rendered || "", imageMap);
  const firstInlineImage = (post.content?.rendered || "").match(/<img\b[^>]*>/i)?.[0];
  const inlineUrl = firstInlineImage ? preferredImageUrl(firstInlineImage) : "";
  const featuredImage = imageMap.get(featuredUrl) || featuredUrl || null;
  const coverImage = featuredImage || imageMap.get(inlineUrl) || inlineUrl || null;
  const embeddedTerms = post._embedded?.["wp:term"]?.flat() || [];

  return {
    id: post.id,
    date: post.date,
    slug: post.slug,
    sourceUrl: post.link,
    title: plainText(post.title?.rendered),
    excerpt: plainText(post.excerpt?.rendered),
    category: categoryName(post),
    tags: embeddedTerms.filter((term) => term.taxonomy === "post_tag").map((term) => term.name),
    featuredImage,
    coverImage,
    content: contentHtml
  };
});

const archiveFile = path.join(articlesDirectory, "articles.json");
let locallyAuthoredArticles = [];
try {
  const existingArchive = JSON.parse(await readFile(archiveFile, "utf8"));
  const importedSlugs = new Set(articles.map((article) => article.slug));
  locallyAuthoredArticles = (existingArchive.articles || []).filter((article) =>
    article.sourceType === "local" && !importedSlugs.has(article.slug)
  );
} catch (error) {
  if (error.code !== "ENOENT") throw new Error(`Could not read existing local archive: ${error.message}`);
}

const combinedArticles = [...articles, ...locallyAuthoredArticles]
  .sort((left, right) => new Date(right.date) - new Date(left.date));
const result = {
  source: "WordPress REST API — ridwanabadi.com",
  retrievedAt: new Date().toISOString(),
  total: combinedArticles.length,
  articles: combinedArticles
};

await writeFile(archiveFile, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(`Saved ${articles.length} WordPress articles and preserved ${locallyAuthoredArticles.length} local articles; localized ${imageMap.size}/${imageUrls.length} image assets.`);
if (failedImages.length) {
  console.warn(`${failedImages.length} image asset(s) could not be downloaded:`);
  for (const failure of failedImages) console.warn(`- ${failure.url}: ${failure.message}`);
}
