import { FormEvent, useEffect, useState } from 'react';
import { Suggestion, suggest } from '../api';

interface Props {
  value: string;
  loading: boolean;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
}

export default function SearchBar({ value, loading, onChange, onSubmit }: Props) {
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (value.trim().length < 2) { setItems([]); return; }
    const ctrl = new AbortController();
    const t = setTimeout(() => suggest(value, ctrl.signal).then(setItems).catch(() => {}), 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [value]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setOpen(false);
    if (value.trim()) onSubmit(value.trim());
  };

  return (
    <form className="searchbar" onSubmit={submit} role="search">
      <div className="search-input-wrap">
        <span className="search-icon" aria-hidden="true">⌕</span>
        <input
          value={value}
          onChange={(e) => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          placeholder="Ví dụ: laptop gaming dưới 20 triệu, RAM 16GB"
          aria-label="Tìm sản phẩm điện tử"
          autoComplete="off"
        />
      </div>
      <button type="submit" disabled={loading}><span aria-hidden="true">⌕</span>{loading ? 'Đang tìm…' : 'Tìm kiếm'}</button>
      {open && items.length > 0 && (
        <ul className="suggest">
          {items.map((s) => (
            <li key={s._id}>
              <button type="button" onMouseDown={() => { onChange(s.name); onSubmit(s.name); setOpen(false); }}>
                {s.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
