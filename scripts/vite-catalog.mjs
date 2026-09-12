import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { catalogEntry } from './build.mjs';
import { DIST, gameWorkspaces } from './workspaces.mjs';

const DEV_REVISION = '0'.repeat(40);
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.wav': 'audio/wav', '.ttf': 'font/ttf', '.html': 'text/html', '.txt': 'text/plain' };
function fail(res, status, message) { res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(message); }
async function sendFile(req, res, root, path) {
  let decoded;
  try { decoded = decodeURIComponent(path); } catch { return fail(res, 400, 'Invalid path'); }
  const file = resolve(root, decoded.replace(/^\/+/, ''));
  if (!file.startsWith(`${resolve(root)}${sep}`)) return fail(res, 403, 'Outside static root');
  let info;
  try { info = await stat(file); } catch (error) { if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return fail(res, 404, 'File not found'); throw error; }
  if (!info.isFile()) return fail(res, 404, 'File not found');
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream', 'Content-Length': String(info.size), 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
  if (req.method === 'HEAD') return res.end();
  const stream = createReadStream(file);
  stream.on('error', error => res.destroy(error));
  stream.pipe(res);
}
/** Vite remains the only development/preview server. No parallel replacement server. */
export function gameCatalogPlugin() {
  return {
    name: 'carrick-game-catalog',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        void (async () => {
          const path = new URL(req.url || '/', 'http://vite.local').pathname;
          if (!path.startsWith('/games/')) return next();
          if (!['GET', 'HEAD'].includes(req.method || 'GET')) return fail(res, 405, 'Method not allowed');
          const games = await gameWorkspaces();
          if (path === '/games/index.json') {
            const entries = games.map(game => catalogEntry({ id: game.id, version: game.pkg.version, revision: DEV_REVISION, apiVersion: 1, entry: 'entry.js', styles: [], meta: game.meta }));
            res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
            return res.end(JSON.stringify({ schemaVersion: 1, apiVersion: 1, generation: 0, games: entries }));
          }
          for (const game of games) {
            const prefix = `/games/${game.id}/${game.pkg.version}/${DEV_REVISION}/`;
            if (!path.startsWith(prefix)) continue;
            const resource = path.slice(prefix.length);
            if (resource === 'entry.js') {
              req.url = `/@fs/${join(game.dir, 'src', 'index.ts')}`;
              return next();
            }
            return sendFile(req, res, join(game.dir, 'public'), resource);
          }
          return fail(res, 404, 'Unknown game release');
        })().catch(error => { console.error(error); if (!res.headersSent) fail(res, 500, 'Game catalog unavailable'); else res.destroy(error); });
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = new URL(req.url || '/', 'http://vite.local').pathname;
        if (!path.startsWith('/games/') && !path.startsWith('/shell/')) return next();
        void sendFile(req, res, DIST, path).catch(error => { console.error(error); if (!res.headersSent) fail(res, 500, 'Static file unavailable'); else res.destroy(error); });
      });
    },
  };
}
