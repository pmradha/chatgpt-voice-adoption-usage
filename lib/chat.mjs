const maxRequestBytes = 64 * 1024;
const maxHistoryMessages = 40;
const maxMessageLength = 12_000;
const situations = new Set(['presentation', 'interview', 'decision', 'general']);

export function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

export async function readJsonRequest(request) {
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxRequestBytes) {
    return { error: jsonResponse(413, { error: 'Request body is too large.' }) };
  }

  const chunks = [];
  let size = 0;
  const reader = request.body?.getReader();
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxRequestBytes) {
        reader.cancel().catch(() => {});
        return { error: jsonResponse(413, { error: 'Request body is too large.' }) };
      }
      chunks.push(value);
    }
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return { body: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { error: jsonResponse(400, { error: 'Request body must be valid JSON.' }) };
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
    general: 'Have an open-ended, supportive conversation about whatever the person brings up. Follow their lead and help them explore what is on their mind.',
  };
  return `You are a thoughtful, concise conversational partner in a ChatGPT Voice discovery prototype. The selected context is ${situation}. ${guidance[situation]} Follow the person's lead, including language switches and mixed-language speech. Keep spoken replies brief and natural. Do not assume facts they have not shared, and do not end every reply with a question.`;
}

export async function handleChat(body, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const validationError = validateConversation(body);
  if (validationError) {
    return jsonResponse(400, { error: validationError });
  }
  if (!env.GROQ_API_KEY) {
    return jsonResponse(503, { error: 'AI is not configured. Set GROQ_API_KEY on the server to continue.' });
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
      return jsonResponse(upstream.status === 429 ? 429 : 502, {
        error: upstream.status === 429
          ? 'The AI service is busy. Please try again shortly.'
          : 'The AI service could not respond. Please try again.',
      });
    }
    const result = await upstream.json();
    const content = result.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      return jsonResponse(502, { error: 'The AI service returned an empty response. Please try again.' });
    }
    return jsonResponse(200, { message: content.trim() });
  } catch (error) {
    const timedOut = error.name === 'TimeoutError';
    return jsonResponse(timedOut ? 504 : 502, {
      error: timedOut
        ? 'The AI response took too long. Please try again.'
        : 'Could not reach the AI service. Check your connection and try again.',
    });
  }
}

export { maxRequestBytes };
