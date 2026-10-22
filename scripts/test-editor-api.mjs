import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverPath = path.join(projectRoot, "scripts", "article-editor-server.mjs");
const temporaryRoot = await mkdtemp(path.join(projectRoot, ".article-editor-test-"));
let child;
let serverLogs = "";

async function unusedPort() {
  const probe = net.createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const { port } = probe.address();
  await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForServer(url, processHandle) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (processHandle.exitCode !== null) throw new Error("Editor server berhenti sebelum siap.");
    try {
      const response = await fetch(`${url}/api/articles`, { signal: AbortSignal.timeout(500) });
      if (response.ok) return;
    } catch {
      // Server may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Editor server tidak siap dalam batas waktu tes.");
}

try {
  await mkdir(path.join(temporaryRoot, "data"), { recursive: true });
  await mkdir(path.join(temporaryRoot, "assets", "articles"), { recursive: true });
  await writeFile(path.join(temporaryRoot, "data", "articles.json"), JSON.stringify({
    total: 1,
    articles: [{
      id: 11,
      date: "2025-01-01T12:00:00.000Z",
      slug: "seed-article",
      sourceType: "wordpress",
      sourceUrl: "https://ridwanabadi.com/seed-article/",
      title: "Artikel contoh",
      excerpt: "Ringkasan artikel contoh.",
      category: "Artikel",
      tags: [],
      featuredImage: null,
      coverImage: null,
      content: "<p>Isi artikel contoh.</p>"
    }]
  }, null, 2));

  const port = await unusedPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, [serverPath], {
    cwd: projectRoot,
    env: { ...process.env, ARTICLE_EDITOR_PORT: String(port), ARTICLE_EDITOR_ROOT: temporaryRoot },
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout.on("data", (chunk) => { serverLogs += chunk.toString(); });
  child.stderr.on("data", (chunk) => { serverLogs += chunk.toString(); });
  await waitForServer(baseUrl, child);

  const initial = await fetch(`${baseUrl}/api/articles`).then((response) => response.json());
  assert.equal(initial.articles.length, 1, "editor dapat membaca artikel lama");

  const draftResponse = await fetch(`${baseUrl}/api/articles`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: "Draf pengujian",
      slug: "draf-pengujian",
      date: "2026-10-22",
      category: "Catatan",
      tags: ["Bisnis"],
      excerpt: "Ringkasan draf.",
      content: "<p>Isi draf.</p>",
      status: "draft"
    })
  });
  const draftResult = await draftResponse.json();
  assert.equal(draftResponse.status, 201, `artikel baru dapat disimpan sebagai draf (${JSON.stringify(draftResult)}) ${serverLogs}`);

  const updateResponse = await fetch(`${baseUrl}/api/articles/seed-article`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: "Artikel contoh diperbarui",
      slug: "seed-article",
      date: "2025-01-01",
      category: "Artikel",
      tags: [],
      excerpt: "Ringkasan diperbarui.",
      content: "<p>Isi diperbarui.</p>",
      status: "published"
    })
  });
  const updateResult = await updateResponse.json();
  assert.equal(updateResponse.status, 200, `artikel lama dapat diperbarui (${JSON.stringify(updateResult)}) ${serverLogs}`);

  const archive = JSON.parse(await readFile(path.join(temporaryRoot, "data", "articles.json"), "utf8"));
  const updated = archive.articles.find((article) => article.slug === "seed-article");
  const draft = archive.articles.find((article) => article.slug === "draf-pengujian");
  assert.equal(updated.title, "Artikel contoh diperbarui");
  assert.equal(updated.id, 11, "id artikel lama tetap");
  assert.equal(updated.sourceType, "wordpress", "metadata sumber artikel lama tetap");
  assert.equal(draft.status, "draft");
  assert.equal(archive.total, 1, "jumlah publik tidak menghitung draf");
  console.log("LULUS: API lokal bisa membaca arsip, menyimpan draf, dan memperbarui artikel tanpa mengubah identitas sumbernya.");
} catch (error) {
  console.error(`Tes editor gagal: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (child && child.exitCode === null) {
    child.kill();
    await Promise.race([once(child, "exit"), new Promise((resolve) => setTimeout(resolve, 1500))]);
  }
  if (path.dirname(temporaryRoot) === projectRoot && path.basename(temporaryRoot).startsWith(".article-editor-test-")) {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}
