// Servidor estático só para os testes: serve app/ com os mesmos cabeçalhos de segurança do vercel.json
// (inclusive a Content-Security-Policy estrita), para que o teste falhe se a página violar a política.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "app");
const headers = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8")).headers[0].headers.map(h => [h.key, h.value]));
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };

http.createServer((req, res) => {
  const p = new URL(req.url, "http://x").pathname;
  const file = path.join(root, p === "/" ? "index.html" : p);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404, headers); return res.end("not found"); }
  res.writeHead(200, { ...headers, "content-type": types[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}).listen(5199, "127.0.0.1", () => console.log("app/ em http://127.0.0.1:5199"));
