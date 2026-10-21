import { MAX_SESSIONS } from '../limits';
import { isProviderId, type ProviderId } from '../providers/types';

const SESSIONS_KEY = 'sidechat_sessions';

export interface SessionMessage {
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  /** Model id that produced the message (assistant replies). */
  model?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  provider: ProviderId;
  model: string;
  createdAt: number;
  updatedAt: number;
  messages: SessionMessage[];
}

function newId(): string {
  return crypto.randomUUID();
}

async function readAll(): Promise<ChatSession[]> {
  const result = await browser.storage.local.get(SESSIONS_KEY);
  const sessions = result[SESSIONS_KEY] as ChatSession[] | undefined;
  return Array.isArray(sessions) ? sessions : [];
}

async function writeAll(sessions: ChatSession[]): Promise<void> {
  const trimmed = sessions
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_SESSIONS);
  await browser.storage.local.set({ [SESSIONS_KEY]: trimmed });
}

export async function listSessions(): Promise<ChatSession[]> {
  const sessions = await readAll();
  return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getSession(id: string): Promise<ChatSession | null> {
  const sessions = await readAll();
  return sessions.find((s) => s.id === id) ?? null;
}

export async function createSession(input: {
  title?: string;
  provider: ProviderId;
  model: string;
}): Promise<ChatSession> {
  if (!isProviderId(input.provider)) throw new Error('Provider inválido.');
  const now = Date.now();
  const session: ChatSession = {
    id: newId(),
    title: (input.title?.trim() || 'Nova sessão').slice(0, 80),
    provider: input.provider,
    model: input.model.trim(),
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
  const sessions = await readAll();
  sessions.unshift(session);
  await writeAll(sessions);
  return session;
}

export async function updateSession(
  id: string,
  patch: Partial<Pick<ChatSession, 'title' | 'provider' | 'model' | 'messages'>>,
): Promise<ChatSession> {
  const sessions = await readAll();
  const index = sessions.findIndex((s) => s.id === id);
  if (index < 0) throw new Error('Sessão não encontrada.');
  const current = sessions[index]!;
  const next: ChatSession = {
    ...current,
    ...patch,
    updatedAt: Date.now(),
  };
  if (patch.provider && !isProviderId(patch.provider)) {
    throw new Error('Provider inválido.');
  }
  sessions[index] = next;
  await writeAll(sessions);
  return next;
}

export async function appendMessages(
  id: string,
  messages: SessionMessage[],
): Promise<ChatSession> {
  const session = await getSession(id);
  if (!session) throw new Error('Sessão não encontrada.');
  return updateSession(id, {
    messages: [...session.messages, ...messages],
    title:
      session.messages.length === 0 && messages[0]?.role === 'user'
        ? messages[0].content.slice(0, 60)
        : session.title,
  });
}

export async function clearSessions(): Promise<void> {
  await browser.storage.local.set({ [SESSIONS_KEY]: [] });
}
