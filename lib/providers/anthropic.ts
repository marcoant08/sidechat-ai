import type { StreamChatRequest } from './types';

export async function* streamAnthropic(
  request: StreamChatRequest,
): AsyncGenerator<string, void, unknown> {
  const system = request.messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n');
  const messages = request.messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role, content: m.content }));

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': request.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: request.model,
      max_tokens: 4096,
      stream: true,
      system: system || undefined,
      messages,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(
      `anthropic error ${response.status}: ${errText.slice(0, 300) || response.statusText}`,
    );
  }
  if (!response.body) throw new Error('Resposta sem body (stream).');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (!data) continue;
      try {
        const json = JSON.parse(data) as {
          type?: string;
          delta?: { type?: string; text?: string };
        };
        if (
          json.type === 'content_block_delta' &&
          json.delta?.type === 'text_delta' &&
          json.delta.text
        ) {
          yield json.delta.text;
        }
      } catch {
        // ignore partial JSON
      }
    }
  }
}
