export const MAX_SELECTION_CHARS = 8_000;
export const MAX_SESSIONS = 50;
export const MAX_MESSAGE_CHARS = 32_000;

export function truncateSelection(text: string): {
  text: string;
  truncated: boolean;
} {
  if (text.length <= MAX_SELECTION_CHARS) {
    return { text, truncated: false };
  }
  return {
    text: text.slice(0, MAX_SELECTION_CHARS),
    truncated: true,
  };
}
