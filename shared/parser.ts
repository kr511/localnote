// Shared by server (card sync) and client (live badge while typing). Keep it dependency-free.

export type CardKind = 'basic' | 'reverse' | 'cloze';

export interface ParsedCard {
  slot: string;
  kind: CardKind;
  front: string;
  back: string;
}

export const CLOZE_PLACEHOLDER = '[…]';
const CLOZE_RE = /\{\{(.+?)\}\}/g;

function splitOnce(text: string, sep: string): [string, string] | null {
  const i = text.indexOf(sep);
  if (i === -1) return null;
  const left = text.slice(0, i).trim();
  const right = text.slice(i + sep.length).trim();
  if (!left || !right) return null;
  return [left, right];
}

/**
 * Detects flashcards inside a single block of text.
 * Priority: `>>` (basic) before `<<` (both directions) before `{{cloze}}`.
 */
export function parseCards(raw: string): ParsedCard[] {
  const text = raw.trim();
  if (!text) return [];

  const basic = splitOnce(text, '>>');
  if (basic) return [{ slot: 'basic', kind: 'basic', front: basic[0], back: basic[1] }];

  const both = splitOnce(text, '<<');
  if (both) {
    return [
      { slot: 'fwd', kind: 'reverse', front: both[0], back: both[1] },
      { slot: 'rev', kind: 'reverse', front: both[1], back: both[0] },
    ];
  }

  const answers = [...text.matchAll(CLOZE_RE)].map((m) => m[1].trim());
  if (answers.length === 0 || answers.some((a) => !a)) return [];

  return answers.map((answer, idx) => {
    let i = 0;
    const front = text.replace(CLOZE_RE, (_m, inner: string) =>
      i++ === idx ? CLOZE_PLACEHOLDER : inner.trim(),
    );
    return { slot: `c${idx}`, kind: 'cloze' as const, front, back: answer };
  });
}
