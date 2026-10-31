/**
 * Cliente da Google Custom Search JSON API (Programmable Search Engine).
 * Docs: https://developers.google.com/custom-search/v1/overview
 *
 * Precisa de duas credenciais:
 * - `apiKey`: chave do Google Cloud com a Custom Search API habilitada;
 * - `cx`: id do Programmable Search Engine (pode buscar a web toda).
 */

const SEARCH_ENDPOINT = 'https://www.googleapis.com/customsearch/v1';

export interface SearchResult {
  title: string;
  link: string;
  snippet: string;
}

export interface GoogleSearchCredentials {
  googleApiKey?: string;
  googleCx?: string;
}

export interface GoogleSearchOptions extends GoogleSearchCredentials {
  query: string;
  /** Quantidade de resultados (1 a 10). */
  num?: number;
}

export function hasGoogleSearchCredentials(
  creds: GoogleSearchCredentials | null | undefined,
): boolean {
  return Boolean(creds?.googleApiKey?.trim() && creds?.googleCx?.trim());
}

export async function googleSearch(
  options: GoogleSearchOptions,
): Promise<SearchResult[]> {
  const apiKey = options.googleApiKey?.trim();
  const cx = options.googleCx?.trim();
  const query = options.query.trim();
  if (!apiKey || !cx) {
    throw new Error('Busca no Google sem credenciais configuradas.');
  }
  if (!query) return [];

  const num = Math.min(Math.max(options.num ?? 5, 1), 10);
  const url = new URL(SEARCH_ENDPOINT);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('cx', cx);
  url.searchParams.set('q', query);
  url.searchParams.set('num', String(num));

  const response = await fetch(url.toString(), { method: 'GET' });
  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(
      `Google Search error ${response.status}: ${
        errText.slice(0, 300) || response.statusText
      }`,
    );
  }

  const json = (await response.json()) as {
    items?: Array<{ title?: string; link?: string; snippet?: string }>;
  };

  return (json.items ?? [])
    .map((item) => ({
      title: (item.title ?? '').trim(),
      link: (item.link ?? '').trim(),
      snippet: (item.snippet ?? '').trim(),
    }))
    .filter((result) => result.link || result.snippet);
}

/** Formata os resultados como contexto para o modelo. */
export function formatSearchResults(
  query: string,
  results: SearchResult[],
): string {
  if (results.length === 0) {
    return `Resultados de busca na web para "${query}": nenhum resultado encontrado.`;
  }
  const lines = results.map((result, index) => {
    const parts = [`${index + 1}. ${result.title || result.link}`];
    if (result.link) parts.push(`   ${result.link}`);
    if (result.snippet) parts.push(`   ${result.snippet}`);
    return parts.join('\n');
  });
  return [
    `Resultados de busca na web para "${query}":`,
    '',
    ...lines,
    '',
    'Use essas informações para responder à última mensagem do usuário. Se os resultados não bastarem, diga o que conseguiu apurar.',
  ].join('\n');
}
