import { streamChat } from '../providers/registry';
import type { ChatMessage, ProviderId } from '../providers/types';

/**
 * Prompt do passo de roteamento. É uma chamada curta e barata: perguntamos ao
 * modelo, com `maxTokens` baixo, se a última mensagem precisa de dados atuais
 * da web antes de responder.
 */
const DECISION_SYSTEM_PROMPT = [
  'Você decide se a última mensagem do usuário precisa de uma busca na web',
  'antes de responder. Responda apenas com uma palavra: SIM ou NAO.',
  '',
  'Responda SIM quando a resposta depender de informação atual ou verificável:',
  'notícias, preços, cotações, clima, placares, resultados recentes, versões',
  'de software, pessoas/empresas/eventos recentes, ou fatos que você não tem',
  'certeza e podem ter mudado.',
  '',
  'Responda NAO quando a mensagem for conversa, opinião, escrita, tradução,',
  'matemática, código ou um conceito estável que não muda com o tempo.',
].join('\n');

const MAX_DECISION_TOKENS = 8;

/** Quanto do histórico conversamos para o modelo decidir. */
const DECISION_CONTEXT_MESSAGES = 6;
/** Limite da mensagem considerada, para manter a chamada de decisão barata. */
const MAX_DECISION_MESSAGE_CHARS = 2_000;

function parseDecision(text: string): boolean | null {
  const normalized = text
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const firstWord = normalized.match(/[A-Z]+/)?.[0];
  if (firstWord === 'SIM' || firstWord === 'YES') return true;
  if (firstWord === 'NAO' || firstWord === 'NO') return false;
  return null;
}

/**
 * Consulta o modelo para decidir se a mensagem precisa de busca. Retorna
 * `null` quando a decisão não pôde ser obtida (falha ou resposta ambígua),
 * caso em que o chamador segue sem busca.
 */
export async function decideSearchNeeded(options: {
  provider: ProviderId;
  model: string;
  apiKey: string;
  history: ChatMessage[];
}): Promise<boolean | null> {
  const recent = options.history
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(-DECISION_CONTEXT_MESSAGES)
    .map((m) => ({
      role: m.role,
      content: m.content.slice(0, MAX_DECISION_MESSAGE_CHARS),
    }));
  if (recent.length === 0) return null;

  let text = '';
  try {
    for await (const delta of streamChat({
      provider: options.provider,
      model: options.model,
      apiKey: options.apiKey,
      messages: [
        { role: 'system', content: DECISION_SYSTEM_PROMPT },
        ...recent,
      ],
      maxTokens: MAX_DECISION_TOKENS,
    })) {
      text += delta;
      if (text.length > 64) break;
    }
  } catch {
    return null;
  }
  return parseDecision(text);
}

/**
 * Extrai o termo de busca a partir da última mensagem. A própria mensagem do
 * usuário já é um bom termo (o texto selecionado na página vem pré-preenchido),
 * então só normalizamos espaços e limitamos o tamanho.
 */
export function buildSearchQuery(history: ChatMessage[]): string {
  const lastUser = [...history].reverse().find((m) => m.role === 'user');
  if (!lastUser) return '';
  return lastUser.content
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_DECISION_MESSAGE_CHARS);
}
