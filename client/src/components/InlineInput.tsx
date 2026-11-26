import { useEffect, useRef, useState } from 'react';

interface Props {
  initial: string;
  placeholder?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

/** Small text input for create/rename. Enter saves, Escape or blur with no change cancels. */
export default function InlineInput({ initial, placeholder, onSubmit, onCancel }: Props) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const submit = () => {
    if (done.current) return;
    done.current = true;
    const v = value.trim();
    if (v && v !== initial) onSubmit(v);
    else onCancel();
  };

  return (
    <input
      ref={ref}
      value={value}
      placeholder={placeholder}
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') submit();
        if (e.key === 'Escape') {
          done.current = true;
          onCancel();
        }
      }}
      onBlur={submit}
      className="min-w-0 flex-1 rounded bg-zinc-800 px-1.5 py-0.5 text-sm text-zinc-100 outline-none ring-1 ring-violet-500/60 placeholder:text-zinc-500"
    />
  );
}
