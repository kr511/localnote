import type { Block } from '../types';

/** Index after the last descendant of blocks[i] (exclusive). */
export function subtreeEnd(blocks: Block[], i: number): number {
  const base = blocks[i].indent;
  let j = i + 1;
  while (j < blocks.length && blocks[j].indent > base) j++;
  return j;
}

/**
 * Indents (delta=+1) or outdents (delta=-1) blocks[i] together with its children.
 * Returns the same array instance if nothing changes.
 */
export function indentSubtree(blocks: Block[], i: number, delta: 1 | -1): Block[] {
  const cur = blocks[i];
  if (delta === 1) {
    if (i === 0 || cur.indent + 1 > blocks[i - 1].indent + 1) return blocks;
  } else if (cur.indent === 0) {
    return blocks;
  }
  const end = subtreeEnd(blocks, i);
  return blocks.map((b, k) => (k >= i && k < end ? { ...b, indent: Math.max(0, b.indent + delta) } : b));
}

/**
 * Turns pasted multi-line text (e.g. a bullet list) into blocks with relative indentation.
 * Accepts tabs or 2/4 spaces and strips leading "-", "*", "•" bullets.
 */
export function parsePastedLines(text: string): { indent: number; content: string }[] {
  const raw = text.replace(/\r\n?/g, '\n').split('\n');
  const lines = raw
    .map((line) => {
      const ws = line.match(/^[\t ]*/)![0];
      const width = [...ws].reduce((n, c) => n + (c === '\t' ? 4 : 1), 0);
      const content = line.slice(ws.length).replace(/^([-*•]|\d+[.)])\s+/, '');
      return { width, content };
    })
    .filter((l) => l.content.trim() !== '');
  if (lines.length === 0) return [];
  const widths = [...new Set(lines.map((l) => l.width))].sort((a, b) => a - b);
  const result: { indent: number; content: string }[] = [];
  for (const l of lines) {
    let indent = widths.indexOf(l.width);
    // never jump more than one level deeper than the previous line
    const prev = result[result.length - 1];
    indent = prev ? Math.min(indent, prev.indent + 1) : 0;
    result.push({ indent, content: l.content });
  }
  return result;
}
