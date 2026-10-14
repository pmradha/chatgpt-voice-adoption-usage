import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHandler } from '../api/chat.mjs';

const validBody = {
  situation: 'general',
  messages: [{ role: 'user', content: 'Hello' }],
};

test('rejects methods other than POST', async () => {
  let providerCalled = false;
  const handler = createHandler({
    env: { GROQ_API_KEY: 'test-only-key' },
    fetchImpl: async () => { providerCalled = true; },
  });

  const response = await handler(new Request('https://example.test/api/chat', { method: 'GET' }));

  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'POST');
  assert.equal(providerCalled, false);
});

test('rejects malformed and invalid chat requests', async () => {
  const handler = createHandler({ env: {} });

  const malformed = await handler(new Request('https://example.test/api/chat', {
    method: 'POST',
    body: '{',
  }));
  assert.equal(malformed.status, 400);
  assert.match((await malformed.json()).error, /valid JSON/);

  const invalid = await handler(new Request('https://example.test/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...validBody, situation: 'unknown' }),
  }));
  assert.equal(invalid.status, 400);
  assert.match((await invalid.json()).error, /valid situation/);
});

test('rejects oversized request streams without content-length', async () => {
  let providerCalled = false;
  const handler = createHandler({
    env: { GROQ_API_KEY: 'test-only-key' },
    fetchImpl: async () => { providerCalled = true; },
  });
  const body = JSON.stringify({
    ...validBody,
    messages: [{ role: 'user', content: 'x'.repeat(64 * 1024) }],
  });
  const request = new Request('https://example.test/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(body));
        controller.close();
      },
    }),
    duplex: 'half',
  });

  assert.equal(request.headers.has('content-length'), false);
  const response = await handler(request);

  assert.equal(response.status, 413);
  assert.match((await response.json()).error, /too large/);
  assert.equal(providerCalled, false);
});

test('reports missing credentials without calling the provider', async () => {
  let providerCalled = false;
  const handler = createHandler({
    env: {},
    fetchImpl: async () => { providerCalled = true; },
  });

  const response = await handler(new Request('https://example.test/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(validBody),
  }));

  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /GROQ_API_KEY/);
  assert.equal(providerCalled, false);
});

test('forwards the configured model and returns a successful mocked response', async () => {
  let capturedRequest;
  const handler = createHandler({
    env: {
      GROQ_API_KEY: 'test-only-key',
      GROQ_MODEL: 'openai/gpt-oss-120b',
    },
    fetchImpl: async (url, options) => {
      capturedRequest = { url, options };
      return new Response(JSON.stringify({ choices: [{ message: { content: 'A mocked reply.' } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  const response = await handler(new Request('https://example.test/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(validBody),
  }));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { message: 'A mocked reply.' });
  assert.equal(capturedRequest.url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(JSON.parse(capturedRequest.options.body).model, 'openai/gpt-oss-120b');
});

test('does not return provider error details', async () => {
  const handler = createHandler({
    env: { GROQ_API_KEY: 'test-only-key' },
    fetchImpl: async () => new Response('private upstream detail', { status: 401 }),
  });

  const response = await handler(new Request('https://example.test/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(validBody),
  }));

  assert.equal(response.status, 502);
  const result = await response.json();
  assert.match(result.error, /AI service could not respond/);
  assert.doesNotMatch(JSON.stringify(result), /private upstream detail/);
});
