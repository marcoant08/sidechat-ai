export type ProviderId = 'openai' | 'groq' | 'anthropic' | 'openrouter';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface StreamChatRequest {
  provider: ProviderId;
  model: string;
  messages: ChatMessage[];
  apiKey: string;
}

export interface ProviderDefinition {
  id: ProviderId;
  label: string;
  defaultModel: string;
  models: string[];
}

export const PROVIDERS: ProviderDefinition[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'o4-mini'],
  },
  {
    id: 'groq',
    label: 'Groq',
    defaultModel: 'openai/gpt-oss-20b',
    models: [
      'openai/gpt-oss-20b',
      'openai/gpt-oss-120b',
      'qwen/qwen3.8-27b',
    ],
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    defaultModel: 'claude-3-5-haiku-latest',
    models: [
      'claude-3-5-haiku-latest',
      'claude-3-5-sonnet-latest',
      'claude-sonnet-4-20250514',
    ],
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    defaultModel: 'openai/gpt-4o-mini',
    models: [
      'openai/gpt-4o-mini',
      'anthropic/claude-3.5-sonnet',
      'google/gemini-2.0-flash-001',
      'meta-llama/llama-3.3-70b-instruct',
    ],
  },
];

/** Mapas de modelos Groq descontinuados → substitutos atuais. */
const GROQ_MODEL_ALIASES: Record<string, string> = {
  'llama-3.3-70b-versatile': 'openai/gpt-oss-120b',
  'llama-3.1-8b-instant': 'openai/gpt-oss-20b',
  'mixtral-8x7b-32768': 'openai/gpt-oss-20b',
  'gemma2-9b-it': 'openai/gpt-oss-20b',
};

export function resolveModelId(provider: ProviderId, model: string): string {
  if (provider === 'groq') {
    return GROQ_MODEL_ALIASES[model] ?? model;
  }
  return model;
}

export function getProvider(id: ProviderId): ProviderDefinition {
  const found = PROVIDERS.find((p) => p.id === id);
  if (!found) throw new Error(`Unknown provider: ${id}`);
  return found;
}

export function isProviderId(value: unknown): value is ProviderId {
  return (
    value === 'openai' ||
    value === 'groq' ||
    value === 'anthropic' ||
    value === 'openrouter'
  );
}
