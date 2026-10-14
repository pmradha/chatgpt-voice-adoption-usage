import { handleChat, readJsonRequest } from '../lib/chat.mjs';

export function createHandler({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  return async function handler(request) {
    if (request.method !== 'POST') {
      return new Response(null, { status: 405, headers: { allow: 'POST' } });
    }

    const { body, error } = await readJsonRequest(request);
    if (error) return error;
    return handleChat(body, { env, fetchImpl });
  };
}

export default { fetch: createHandler() };
