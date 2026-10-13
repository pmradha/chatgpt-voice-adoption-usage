import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { createServer } from '../server.mjs';

let server;
let origin;

beforeEach(async () => {
  server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test('rejects invalid situations before contacting the provider', async () => {
  const response = await fetch(`${origin}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ situation: 'other', messages: [{ role: 'user', content: 'Hello' }] }),
  });

  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /valid situation/);
});

test('serves the discovery page and browser bundle without exposing server files', async () => {
  const home = await fetch(origin);
  const page = await home.text();
  assert.equal(home.status, 200);
  assert.match(page, /What are you trying/);
  assert.match(page, /Or type instead/);

  const client = await fetch(`${origin}/app.js`);
  const script = await client.text();
  assert.equal(client.status, 200);
  assert.match(script, /SpeechRecognition/);
  assert.doesNotMatch(script, /GROQ_API_KEY/);

  const serverSource = await fetch(`${origin}/server.mjs`);
  assert.equal(serverSource.status, 404);
});

test('reports missing server credentials without attempting a provider call', async () => {
  server.close();
  let providerCalled = false;
  server = createServer({
    env: {},
    fetchImpl: async () => { providerCalled = true; },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;

  const response = await fetch(`${origin}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ situation: 'interview', messages: [{ role: 'user', content: 'Hello' }] }),
  });

  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /GROQ_API_KEY/);
  assert.equal(providerCalled, false);
});

test('forwards situation and full history with server-only credentials and configurable model', async () => {
  let captured;
  server.close();
  server = createServer({
    env: {
      GROQ_API_KEY: 'test-server-secret',
      GROQ_BASE_URL: 'https://groq.example/openai/v1/',
      GROQ_MODEL: 'test-model',
    },
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return new Response(JSON.stringify({ choices: [{ message: { content: 'A provider-generated test reply.' } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  const messages = [
    { role: 'user', content: 'I have a product interview.' },
    { role: 'assistant', content: 'What part would you like to focus on?' },
    { role: 'user', content: 'Help me explain my last project.' },
  ];

  const response = await fetch(`${origin}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ situation: 'interview', messages }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { message: 'A provider-generated test reply.' });
  assert.equal(captured.url, 'https://groq.example/openai/v1/chat/completions');
  assert.equal(captured.options.headers.authorization, 'Bearer test-server-secret');
  const providerBody = JSON.parse(captured.options.body);
  assert.equal(providerBody.model, 'test-model');
  assert.match(providerBody.messages[0].content, /interview/);
  assert.deepEqual(providerBody.messages.slice(1), messages);
});

test('accepts general context and provides open-ended conversation guidance', async () => {
  let captured;
  server.close();
  server = createServer({
    env: { GROQ_API_KEY: 'test-server-secret' },
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return new Response(JSON.stringify({ choices: [{ message: { content: 'What would you like to talk about?' } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;

  const response = await fetch(`${origin}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ situation: 'general', messages: [{ role: 'user', content: 'Hello' }] }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { message: 'What would you like to talk about?' });
  const providerMessages = JSON.parse(captured.options.body).messages;
  assert.match(providerMessages[0].content, /open-ended, supportive conversation/);
  assert.deepEqual(providerMessages.slice(1), [{ role: 'user', content: 'Hello' }]);
});

test('does not return provider error details to the browser', async () => {
  server.close();
  server = createServer({
    env: { GROQ_API_KEY: 'test-server-secret' },
    fetchImpl: async () => new Response('private upstream detail', { status: 401 }),
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;

  const response = await fetch(`${origin}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ situation: 'decision', messages: [{ role: 'user', content: 'I have two choices.' }] }),
  });

  assert.equal(response.status, 502);
  const body = await response.json();
  assert.match(body.error, /AI service could not respond/);
  assert.doesNotMatch(JSON.stringify(body), /private upstream detail/);
});