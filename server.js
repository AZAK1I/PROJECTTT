const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const host = '127.0.0.1';
const port = Number(process.env.PORT || 8000);
const envPath = path.join(__dirname, '.env');
const distRoot = path.join(__dirname, 'dist');
const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.woff2', 'font/woff2'],
  ['.wasm', 'application/wasm'],
]);

function readApiKey() {
  const environmentKey = process.env.DECART_API_KEY?.trim();
  try {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (match?.[1] === 'DECART_API_KEY') {
        const fileKey = match[2].replace(/^(["'])(.*)\1$/, '$2').trim();
        return environmentKey || fileKey;
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return environmentKey || '';
}

function sendJson(response, status, value) {
  const body = Buffer.from(JSON.stringify(value));
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': body.length,
  });
  response.end(body);
}

let sdkPromise;
async function createRealtimeToken(response) {
  const apiKey = readApiKey();
  if (!apiKey) {
    return sendJson(response, 503, { error: 'Decart API key is missing. Add DECART_API_KEY to .env, then try again.' });
  }
  try {
    sdkPromise ||= import('@decartai/sdk');
    const { createDecartClient } = await sdkPromise;
    const decart = createDecartClient({ apiKey });
    const token = await decart.tokens.create({ expiresIn: 300, metadata: { app: 'anywear-live-tryon' } });
    if (!token.apiKey) throw new Error('Decart did not return a client token.');
    return sendJson(response, 200, { apiKey: token.apiKey, expiresAt: token.expiresAt });
  } catch (error) {
    const status = error.status || error.statusCode;
    if (status === 401 || status === 403) {
      return sendJson(response, 502, { error: 'Decart rejected the API key. Check DECART_API_KEY in .env.' });
    }
    return sendJson(response, 502, { error: `Could not create a Decart session token: ${error.message || 'unknown error'}` });
  }
}

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, `http://${host}:${port}`).pathname;
  if (request.method === 'POST' && pathname === '/api/realtime-token') {
    void createRealtimeToken(response);
    return;
  }
  if (request.method !== 'GET') {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }
  const requested = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const filePath = path.resolve(distRoot, requested);
  if (filePath !== distRoot && !filePath.startsWith(`${distRoot}${path.sep}`)) {
    response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Forbidden');
    return;
  }
  fs.readFile(filePath, (error, page) => {
    if (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end(error.code === 'ENOENT' ? 'Not found' : 'Could not load website asset');
      return;
    }
    response.writeHead(200, {
      'Content-Type': mimeTypes.get(path.extname(filePath)) || 'application/octet-stream',
      'Cache-Control': filePath.endsWith('index.html') ? 'no-store' : 'public, max-age=3600',
      'Content-Length': page.length,
    });
    response.end(page);
  });
});

server.listen(port, host, () => {
  console.log(`Anywear live AI try-on is ready at http://${host}:${port}`);
  console.log('Keep this window open while using the site. Press Ctrl+C to stop.');
  if (!readApiKey()) console.log('Configure DECART_API_KEY in the local .env file to enable AI sessions.');
});
