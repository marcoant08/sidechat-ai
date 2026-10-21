import type { StreamChatRequest } from './types';

const ENDPOINTS: Record<'openai' | 'groq' | 'openrouter', string> = {
  openai: 'https://api.openai.com/v1/chat/completions',
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
};

export async function* streamOpenAICompatible(
  provider: 'openai' | 'groq' | 'openrouter',
  request: StreamChatRequest,
): AsyncGenerator<string, void, unknown> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${request.apiKey}`,
  };
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://sidechat-ai.local';
    headers['X-Title'] = 'Sidechat AI';
  }

  const response = await fetch(ENDPOINTS[provider], {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: request.model,
      messages: request.messages,
      stream: true,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(
      `${provider} error ${response.status}: ${errText.slice(0, 300) || response.statusText}`,
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
      if (data === '[DONE]') return;
      try {
        const json = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const content = json.choices?.[0]?.delta?.content;
        if (content) yield content;
      } catch {
        // ignore partial JSON chunks
      }
    }
  }
}
