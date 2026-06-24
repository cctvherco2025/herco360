import React, { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';

/**
 * Free-text input with a suggestions dropdown.
 * props:
 *  - value, onChange(string)
 *  - fetchSuggestions(query) -> Promise<[{ name, hint? }]>
 *  - placeholder, disabled, disabledHint, testid
 */
export default function ArticleAutocomplete({ value, onChange, onSelect, fetchSuggestions, placeholder, disabled, disabledHint, testid }) {
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    const onDocClick = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(() => {
    if (!open || disabled) return;
    let active = true;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetchSuggestions(value || '');
        if (active) setSuggestions(res || []);
      } catch (e) { if (active) setSuggestions([]); }
      finally { if (active) setLoading(false); }
    }, 200);
    return () => { active = false; clearTimeout(t); };
  }, [value, open, disabled, fetchSuggestions]);

  return (
    <div className="relative" ref={boxRef}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          data-testid={testid}
          value={value}
          disabled={disabled}
          onChange={(e) => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => !disabled && setOpen(true)}
          placeholder={disabled ? (disabledHint || placeholder) : placeholder}
          className="pl-10 pr-9 h-11"
          autoComplete="off"
        />
        {value && !disabled && (
          <button type="button" onClick={() => { onChange(''); setOpen(true); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {open && !disabled && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border bg-popover shadow-float max-h-[260px] overflow-y-auto p-1.5">
          {loading && <p className="text-sm text-muted-foreground text-center py-3">Buscando…</p>}
          {!loading && suggestions.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-3">
              {value ? 'Sin coincidencias — puedes usar este texto' : 'Escribe para buscar'}
            </p>
          )}
          {!loading && suggestions.map((s) => (
            <button key={s.name} type="button"
              onClick={() => { onChange(s.name); onSelect?.(s.name); setOpen(false); }}
              className="w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted">
              <span className="truncate">{s.name}</span>
              {s.hint != null && <span className="text-xs text-muted-foreground shrink-0">{s.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
