// Small shared building blocks used across pages.
import { useEffect, useRef, useState } from 'react';

export function Field({ label, className = '', ...props }) {
  return (
    <label className={`block text-xs text-slate-600 ${className}`}>
      {label}
      <input step="any" {...props} className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
    </label>
  );
}

export function TextArea({ label, className = '', ...props }) {
  return (
    <label className={`block text-xs text-slate-600 ${className}`}>
      {label}
      <textarea rows={2} {...props} className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
    </label>
  );
}

// Searchable dropdown. options: [{ id, name }] or use getLabel for custom text.
// onChange receives { target: { value } } so it works like a native <select> handler.
export function Select({ label, className = '', ...props }) {
  return (
    <label className={`block text-xs text-slate-600 ${className}`}>
      {label}
      <SearchSelect {...props} className="mt-1" />
    </label>
  );
}

export function SearchSelect({ options, value, onChange, placeholder = 'Select', getLabel = (o) => o.name, required, disabled, className = '' }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState(null);
  const boxRef = useRef(null);
  const listRef = useRef(null);

  const selected = options.find((o) => String(o.id) === String(value ?? ''));
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = options
    .map((o) => ({ id: String(o.id), text: getLabel(o) }))
    .filter((o) => words.every((w) => o.text.toLowerCase().includes(w)));
  const list = words.length ? matches : [{ id: '', text: placeholder }, ...matches];

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!boxRef.current?.contains(e.target)) { setOpen(false); setQuery(''); } };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  // The list is position:fixed so tables with overflow (e.g. line items) don't clip it.
  useEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const r = boxRef.current.getBoundingClientRect();
      const below = window.innerHeight - r.bottom;
      setPos({ left: r.left, width: r.width, ...(below < 250 && r.top > below ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }) });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => { window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place); };
  }, [open]);

  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const choose = (id) => {
    onChange?.({ target: { value: id } });
    setOpen(false);
    setQuery('');
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) return setOpen(true);
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((a) => Math.min(Math.max(a + step, 0), list.length - 1));
    } else if (e.key === 'Enter') {
      if (!open) return;
      e.preventDefault(); // pick the option instead of submitting the form
      if (list[active]) choose(list[active].id);
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      setOpen(false);
      setQuery('');
    }
  };

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <input
        value={open ? query : selected ? getLabel(selected) : ''}
        placeholder={selected ? getLabel(selected) : placeholder}
        onChange={(e) => { setQuery(e.target.value); setActive(0); setOpen(true); }}
        onFocus={() => { setOpen(true); setActive(0); }}
        onClick={() => setOpen(true)}
        onKeyDown={onKeyDown}
        disabled={disabled}
        role="combobox"
        aria-expanded={open}
        autoComplete="off"
        className="w-full rounded border border-slate-300 bg-white py-1.5 pl-2 pr-7 text-sm text-slate-800 placeholder:text-slate-500 disabled:bg-slate-100"
      />
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">▾</span>
      {/* Hidden mirror so the browser's "required" check still works on forms */}
      {required && (
        <input tabIndex={-1} aria-hidden="true" required value={value ?? ''} onChange={() => {}} className="pointer-events-none absolute bottom-0 left-2 h-px w-px opacity-0" />
      )}
      {open && pos && (
        <ul ref={listRef} role="listbox" style={pos} className="fixed z-50 max-h-60 min-w-48 overflow-y-auto rounded border border-slate-200 bg-white py-1 text-sm shadow-lg">
          {list.length === 0 && <li className="px-3 py-2 text-slate-400">No matches</li>}
          {list.map((o, i) => (
            <li
              key={o.id || '__empty'}
              role="option"
              aria-selected={o.id === String(value ?? '')}
              onMouseDown={(e) => { e.preventDefault(); choose(o.id); }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-1.5 ${i === active ? 'bg-indigo-50' : ''} ${o.id === String(value ?? '') ? 'font-medium text-indigo-700' : o.id === '' ? 'text-slate-500' : 'text-slate-800'}`}
            >
              {o.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Button({ variant = 'primary', className = '', ...props }) {
  const styles = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700',
    secondary: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
    danger: 'bg-red-600 text-white hover:bg-red-700',
  };
  return <button {...props} className={`rounded px-4 py-2 text-sm disabled:opacity-50 ${styles[variant]} ${className}`} />;
}

export function Modal({ title, onClose, children, wide = false }) {
  return (
    <div className="fixed inset-0 z-20 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className={`my-8 w-full ${wide ? 'max-w-4xl' : 'max-w-2xl'} rounded-lg bg-white p-6 shadow-lg`}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
          <button onClick={onClose} className="text-xl leading-none text-slate-400 hover:text-slate-600" aria-label="Close">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ErrorBox({ children }) {
  return children ? <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{children}</div> : null;
}

export function Card({ label, value, tone }) {
  return (
    <div className="rounded-lg bg-white p-4 shadow">
      <div className="text-xs uppercase text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${tone === 'warn' ? 'text-red-600' : 'text-slate-800'}`}>{value}</div>
    </div>
  );
}

const badgeTones = {
  ordered: 'bg-amber-100 text-amber-800',
  received: 'bg-green-100 text-green-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-slate-200 text-slate-600',
  low: 'bg-red-100 text-red-700',
};
export function Badge({ children, tone }) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium capitalize ${badgeTones[tone || children] || 'bg-slate-100 text-slate-700'}`}>
      {children}
    </span>
  );
}

// columns: [{ label, className? }]; children are <tr> rows
export function Table({ columns, children, empty, colSpan }) {
  const hasRows = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <div className="overflow-x-auto rounded-lg bg-white shadow">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            {columns.map((c, i) => (
              <th key={i} className={`px-4 py-3 ${c.className || ''}`}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {hasRows ? children : (
            <tr><td colSpan={colSpan || columns.length} className="px-4 py-6 text-center text-slate-500">{empty || 'Nothing found'}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function Td({ className = '', ...props }) {
  return <td {...props} className={`px-4 py-2 ${className}`} />;
}

export function Pagination({ page, perPage, total, onChange, noun = 'records' }) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  return (
    <div className="flex items-center justify-between text-sm text-slate-600">
      <span>{total} {noun}</span>
      <div className="space-x-2">
        <button disabled={page <= 1} onClick={() => onChange(page - 1)} className="rounded border px-3 py-1 disabled:opacity-40">Prev</button>
        <span>{page} / {pages}</span>
        <button disabled={page >= pages} onClick={() => onChange(page + 1)} className="rounded border px-3 py-1 disabled:opacity-40">Next</button>
      </div>
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-slate-200">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`-mb-px border-b-2 px-4 py-2 text-sm ${value === t.key ? 'border-indigo-600 font-medium text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
