import { cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist");
if (path.dirname(output) !== root || path.basename(output) !== "dist") throw new Error("Lokasi output Cloudflare tidak valid.");

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const pages = (await readdir(root, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".html"))
  .map((entry) => entry.name);
for (const page of pages) await cp(path.join(root, page), path.join(output, page));
for (const folder of ["css", "js", "assets", "data", "admin"]) {
  await cp(path.join(root, folder), path.join(output, folder), { recursive: true });
}
await writeFile(path.join(output, "_routes.json"), JSON.stringify({
  version: 1,
  include: ["/admin", "/admin/*", "/api/auth/*", "/api/admin/*", "/api/articles", "/api/article-image/*"],
  exclude: [],
}, null, 2) + "\n");
console.log(`Siap: ${pages.length} halaman, aset situs, editor admin, dan routing Pages Functions dikemas ke dist/.`);
