// Local server that behaves like Vercel: static files from public/, /api/<name> → api/<name>.js.
// Usage: node --env-file=.env scripts/dev.js   (then open http://localhost:3000)
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml' };
const port = Number(process.env.PORT) || 3000;

http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://x');
  try {
    const m = pathname.match(/^\/api\/([a-z-]+)$/);
    if (m) {
      const mod = await import(pathToFileURL(join(root, 'api', m[1] + '.js')).href);
      return mod.default(req, res);
    }
    const file = normalize(join(root, 'public', pathname === '/' ? 'index.html' : pathname));
    if (!file.startsWith(join(root, 'public'))) throw Object.assign(new Error(), { code: 'ENOENT' });
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch (e) {
    res.writeHead(e.code === 'ENOENT' || e.code === 'ERR_MODULE_NOT_FOUND' ? 404 : 500);
    res.end(e.code === 'ENOENT' || e.code === 'ERR_MODULE_NOT_FOUND' ? 'Not found' : String(e));
  }
}).listen(port, () => console.log(`http://localhost:${port}`));
