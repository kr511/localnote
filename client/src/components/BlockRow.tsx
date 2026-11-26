import { memo, useLayoutEffect, useRef } from 'react';
import { ArrowLeftRight, Brackets, Layers } from 'lucide-react';
import type { Block } from '../types';
import { parseCards } from '../../../shared/parser';

export const INDENT_PX = 24;

interface Props {
  block: Block;
  index: number;
  highlighted: boolean;
  register: (id: string, el: HTMLTextAreaElement | null) => void;
  onChange: (index: number, content: string) => void;
  onKeyDown: (index: number, e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onPaste: (index: number, e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
}

function CardBadge({ content }: { content: string }) {
  const cards = parseCards(content);
  if (cards.length === 0) return null;
  const kind = cards[0].kind;
  const Icon = kind === 'basic' ? Layers : kind === 'reverse' ? ArrowLeftRight : Brackets;
  const label =
    kind === 'basic' ? 'Karte' : kind === 'reverse' ? 'beidseitig' : cards.length > 1 ? `${cards.length} Lücken` : 'Lücke';
  return (
    <span
      title={`${cards.length} Karteikarte${cards.length > 1 ? 'n' : ''}`}
      className="mt-1 inline-flex h-5 shrink-0 select-none items-center gap-1 rounded-full bg-violet-500/10 px-2 text-[11px] font-medium text-violet-300/90 ring-1 ring-violet-500/20"
    >
      <Icon size={11} />
      {label}
    </span>
  );
}

function BlockRow({ block, index, highlighted, register, onChange, onKeyDown, onPaste }: Props) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const isCard = parseCards(block.content).length > 0;

  // Auto-grow the textarea to fit its content.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, [block.content]);

  return (
    <div
      className={`group relative flex items-start gap-2 rounded-md pr-2 transition-colors ${
        highlighted ? 'bg-violet-500/10' : ''
      }`}
      style={{ paddingLeft: block.indent * INDENT_PX }}
    >
      {/* indentation guides */}
      {Array.from({ length: block.indent }, (_, l) => (
        <span
          key={l}
          className="pointer-events-none absolute bottom-0 top-0 w-px bg-zinc-800"
          style={{ left: l * INDENT_PX + 11 }}
        />
      ))}
      <span className="flex h-7 w-[22px] shrink-0 items-center justify-center">
        <span
          className={`h-1.5 w-1.5 rounded-full transition-colors ${
            isCard ? 'bg-violet-400' : 'bg-zinc-600 group-focus-within:bg-zinc-400'
          }`}
        />
      </span>
      <textarea
        ref={(el) => {
          ref.current = el;
          register(block.id, el);
        }}
        data-block-id={block.id}
        rows={1}
        spellCheck
        value={block.content}
        placeholder={index === 0 && !block.content ? 'Schreib los… (Frage >> Antwort, Begriff << Definition, {{Lücke}})' : ''}
        onChange={(e) => onChange(index, e.target.value)}
        onKeyDown={(e) => onKeyDown(index, e)}
        onPaste={(e) => onPaste(index, e)}
        className="block min-h-7 flex-1 resize-none overflow-hidden bg-transparent py-1 leading-5 text-[15px] text-zinc-200 outline-none placeholder:text-zinc-600"
      />
      <CardBadge content={block.content} />
    </div>
  );
}

export default memo(BlockRow);
