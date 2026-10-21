import { streamAnthropic } from './anthropic';
import { streamOpenAICompatible } from './openaiCompatible';
import type { StreamChatRequest } from './types';

export async function* streamChat(
  request: StreamChatRequest,
): AsyncGenerator<string, void, unknown> {
  switch (request.provider) {
    case 'openai':
    case 'groq':
    case 'openrouter':
      yield* streamOpenAICompatible(request.provider, request);
      break;
    case 'anthropic':
      yield* streamAnthropic(request);
      break;
    default:
      throw new Error(`Provider não suportado: ${request.provider}`);
  }
}
