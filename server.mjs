import { createReadStream } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { access } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDirectory = fileURLToPath(new URL('.', import.meta.url));
const publicDirectory = resolve(projectDirectory, 'public');
const maxRequestBytes = 64 * 1024;
const maxHistoryMessages = 40;
const maxMessageLength = 12_000;
const situations = new Set(['presentation', 'interview', 'decision']);
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

function json(response, status, body) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(body));
}

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

function validateConversation(body) {
  if (!body || typeof body !== 'object' || !situations.has(body.situation)) {
    return 'Choose a valid situation before starting.';
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0 || body.messages.length > maxHistoryMessages) {
    return 'Conversation history is missing or too long.';
  }
  let totalLength = 0;
  for (const message of body.messages) {
    if (!message || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string') {
      return 'Conversation history contains an invalid message.';
    }
    if (!message.content.trim() || message.content.length > maxMessageLength) {
      return 'Messages must contain text and stay within the size limit.';
    }
    totalLength += message.content.length;
  }
  if (totalLength > maxRequestBytes || body.messages.at(-1).role !== 'user') {
    return 'Add a user message before requesting a response.';
  }
  return null;
}

function systemPrompt(situation) {
  const guidance = {
    presentation: 'Help the person prepare their presentation in the way they ask, including content, structure, delivery, questions, or concerns.',
    interview: 'Help the person prepare for the role and interview they describe, responding to their actual experience, questions, and concerns.',
    decision: 'Help the person think through the options, criteria, trade-offs, and uncertainty they describe without deciding for them.',
  };
  return `You are a thoughtful, concise conversational partner in a ChatGPT Voice discovery prototype. The selected context is ${situation}. ${guidance[situation]} Follow the person's lead, including language switches and mixed-language speech. Keep spoken replies brief and natural. Do not assume facts they have not shared, and do not end every reply with a question.`;
}

async function handleChat(request, response, { env, fetchImpl }) {
  let body;
  try {
    body = await readJson(request);
  } catch (error) {
    json(response, error.status ?? 400, { error: error.message });
    return;
  }

  const validationError = validateConversation(body);
  if (validationError) {
    json(response, 400, { error: validationError });
    return;
  }
  if (!env.GROQ_API_KEY) {
    json(response, 503, { error: 'AI is not configured. Set GROQ_API_KEY on the server to continue.' });
    return;
  }

  const baseUrl = (env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/$/, '');
  const model = env.GROQ_MODEL || 'llama-3.3-70b-versatile';
  try {
    const upstream = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.GROQ_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt(body.situation) },
          ...body.messages,
        ],
        temperature: 0.7,
        max_tokens: 300,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!upstream.ok) {
      json(response, upstream.status === 429 ? 429 : 502, {
        error: upstream.status === 429
          ? 'The AI service is busy. Please try again shortly.'
          : 'The AI service could not respond. Please try again.',
      });
      return;
    }
    const result = await upstream.json();
    const content = result.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      json(response, 502, { error: 'The AI service returned an empty response. Please try again.' });
      return;
    }
    json(response, 200, { message: content.trim() });
  } catch (error) {
    const timedOut = error.name === 'TimeoutError';
    json(response, timedOut ? 504 : 502, {
      error: timedOut
        ? 'The AI response took too long. Please try again.'
        : 'Could not reach the AI service. Check your connection and try again.',
    });
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
      await handleChat(request, response, { env, fetchImpl });
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      json(response, 404, { error: 'Not found.' });
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