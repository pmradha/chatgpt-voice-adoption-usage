import { createReadStream } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { access } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleChat, jsonResponse, maxRequestBytes } from './lib/chat.mjs';

const projectDirectory = fileURLToPath(new URL('.', import.meta.url));
const publicDirectory = resolve(projectDirectory, 'public');
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxRequestBytes) {
      const error = new Error('Request body is too large.');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const error = new Error('Request body must be valid JSON.');
    error.status = 400;
    throw error;
  }
}

async function serveStatic(pathname, response) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    response.writeHead(400).end();
    return;
  }
  const requestedPath = decodedPath === '/' ? '/index.html' : decodedPath;
  const filePath = resolve(publicDirectory, `.${requestedPath}`);
  if (!filePath.startsWith(`${publicDirectory}${sep}`)) {
    response.writeHead(404).end();
    return;
  }
  try {
    await access(filePath);
    response.writeHead(200, {
      'content-type': contentTypes[extname(filePath)] || 'application/octet-stream',
      'x-content-type-options': 'nosniff',
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found');
  }
}

export function createServer({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  return createHttpServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/api/chat' && request.method === 'POST') {
      let body;
      try {
        body = await readJson(request);
      } catch (error) {
        const errorResponse = jsonResponse(error.status ?? 400, { error: error.message });
        response.writeHead(errorResponse.status, Object.fromEntries(errorResponse.headers));
        response.end(await errorResponse.text());
        return;
      }
      const chatResponse = await handleChat(body, { env, fetchImpl });
      response.writeHead(chatResponse.status, Object.fromEntries(chatResponse.headers));
      response.end(await chatResponse.text());
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      const errorResponse = jsonResponse(404, { error: 'Not found.' });
      response.writeHead(errorResponse.status, Object.fromEntries(errorResponse.headers));
      response.end(await errorResponse.text());
      return;
    }
    if (request.method !== 'GET') {
      response.writeHead(405, { allow: 'GET' }).end();
      return;
    }
    await serveStatic(url.pathname, response);
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createServer();
  const port = Number(process.env.PORT) || 3000;
  server.listen(port, '0.0.0.0', () => {
    console.log(`Voice discovery prototype listening on http://localhost:${port}`);
  });
}