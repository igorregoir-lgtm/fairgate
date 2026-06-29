// Servidor estático mínimo (sem deps) p/ preview local. node scripts/serve.mjs [porta]
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.argv[2] || process.env.PORT || 4178);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".csv": "text/csv; charset=utf-8", ".svg": "image/svg+xml" };

createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p === "/" || p === "") p = "/index.html";
    const fp = normalize(join(ROOT, p));
    if (!fp.startsWith(ROOT)) { res.writeHead(403).end("forbidden"); return; }
    const st = await stat(fp).catch(() => null);
    if (!st || st.isDirectory()) { res.writeHead(404).end("not found"); return; }
    const buf = await readFile(fp);
    res.writeHead(200, { "Content-Type": TYPES[extname(fp).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(buf);
  } catch (e) { res.writeHead(500).end(String(e)); }
}).listen(PORT, () => console.log("fairgate preview em http://localhost:" + PORT));
