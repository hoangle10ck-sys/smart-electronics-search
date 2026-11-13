import { FormEvent, KeyboardEvent, useEffect, useState } from 'react';
import { Suggestion, suggest } from '../api';
import Icon from './Icon';

interface Props {
  id: string;
  value: string;
  loading: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
}

export default function SearchBar({ id, value, loading, placeholder, onChange, onSubmit }: Props) {
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const listId = `${id}-suggestions`;

  useEffect(() => {
    if (value.trim().length < 2) {
      setItems([]);
      setActiveIndex(-1);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      suggest(value, controller.signal)
        .then((next) => { setItems(next); setActiveIndex(-1); })
        .catch(() => { if (!controller.signal.aborted) setItems([]); });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [value]);

  const choose = (item: Suggestion) => {
    onChange(item.name);
    onSubmit(item.name);
    setOpen(false);
    setActiveIndex(-1);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (activeIndex >= 0 && items[activeIndex]) return choose(items[activeIndex]);
    setOpen(false);
    if (value.trim()) onSubmit(value.trim());
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') { setOpen(false); setActiveIndex(-1); }
    if (event.key === 'ArrowDown' && items.length) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => (current + 1) % items.length);
    }
    if (event.key === 'ArrowUp' && items.length) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => current <= 0 ? items.length - 1 : current - 1);
    }
  };

  return (
    <form className="search-form" onSubmit={submit} role="search">
      <div className="search-input-wrap">
        <Icon name="search" size={21} className="search-input-icon" />
        <input
          id={id}
          type="search"
          value={value}
          onChange={(event) => { onChange(event.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder ?? 'Ví dụ: laptop Dell dưới 20 triệu'}
          aria-label="Tìm sản phẩm điện tử theo nhu cầu"
          aria-autocomplete="list"
          aria-expanded={open && items.length > 0}
          aria-controls={listId}
          aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
          autoComplete="off"
          spellCheck="false"
        />
        {value && <button className="search-clear" type="button" onClick={() => { onChange(''); setItems([]); setOpen(false); }} aria-label="Xóa nội dung tìm kiếm"><Icon name="close" size={17} /></button>}
      </div>
      <button className="search-submit" type="submit" disabled={loading || !value.trim()}>
        {loading ? <span className="spinner" aria-hidden="true" /> : <Icon name="search" size={18} />}
        <span>{loading ? 'Đang tìm' : 'Tìm kiếm'}</span>
      </button>
      {open && items.length > 0 && (
        <ul className="suggestion-list" id={listId} role="listbox" aria-label="Gợi ý sản phẩm">
          {items.map((item, index) => (
            <li
              id={`${listId}-${index}`}
              key={item._id}
              role="option"
              aria-selected={activeIndex === index}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(item)}
              className={activeIndex === index ? 'active' : ''}
            >
              <Icon name="search" size={16} />
              <span>{item.name}</span>
              <small>{item.category}</small>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
