import { useEffect, useRef } from 'react';
import { SearchSelect } from './ui.jsx';
import { money, productLabel, qty } from '../utils/format';

export const blankItem = () => ({ product_id: '', qty: '1', rate: '' });
export const itemsTotal = (items) => items.reduce((sum, it) => sum + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0);

// Line items for purchases and sales.
// priceField: product field used to prefill the rate ("purchase_price" or "selling_price")
// checkStock: warn when qty exceeds what's in stock (sales)
// showPricing: show MRP, discount and GST rate under the product (sales; prices include GST)
export default function ItemsEditor({ products, items, onChange, priceField, checkStock = false, showPricing = false }) {
  const byId = Object.fromEntries(products.map((p) => [String(p.id), p]));

  const update = (i, patch) => onChange(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const pick = (i, productId) => {
    const dup = items.findIndex((it, j) => j !== i && it.product_id === productId);
    if (dup === -1) return update(i, { product_id: productId, rate: byId[productId]?.[priceField] ?? '' });
    // Product already on another line: add this line's qty there and drop this line.
    const added = Number(items[i].qty) || 1;
    onChange(items.flatMap((it, j) => {
      if (j === i) return [];
      if (j === dup) return [{ ...it, qty: (Number(it.qty) || 0) + added }];
      return [it];
    }));
  };

  // Keyboard entry: the product search of the row to focus after a keyboard add or move.
  const productRefs = useRef([]);
  const focusRow = useRef(null);
  useEffect(() => {
    if (focusRow.current == null) return;
    productRefs.current[focusRow.current]?.focus();
    focusRow.current = null;
  });

  const addLine = (after) => {
    focusRow.current = after + 1;
    onChange([...items.slice(0, after + 1), blankItem(), ...items.slice(after + 1)]);
  };

  // Enter in qty/rate goes to the next line, adding one after the last.
  const onRowEnter = (e, i) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (i === items.length - 1) addLine(i);
    else productRefs.current[i + 1]?.focus();
  };

  // Alt+N adds a line from anywhere on the page.
  useEffect(() => {
    const onKey = (e) => {
      if (e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        addLine(items.length - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="py-2 pr-2">Product</th>
              <th className="w-28 py-2 pr-2">Qty</th>
              <th className="w-32 py-2 pr-2">{showPricing ? 'Price (incl. GST)' : 'Rate'}</th>
              <th className="w-32 py-2 pr-2 text-right">Amount</th>
              <th className="w-16" />
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => {
              const p = byId[it.product_id];
              const short = checkStock && p && Number(it.qty) > Number(p.stock_qty);
              return (
                <tr key={i} className="align-top">
                  <td className="py-1 pr-2">
                    <SearchSelect
                      inputRef={(el) => { productRefs.current[i] = el; }}
                      value={it.product_id}
                      onChange={(e) => pick(i, e.target.value)}
                      options={products}
                      getLabel={productLabel}
                      placeholder="Search product..."
                      required
                    />
                    {p && (
                      <div className={`mt-0.5 text-xs ${short ? 'text-red-600' : 'text-slate-500'}`}>
                        {showPricing && (
                          <>
                            MRP {money(p.mrp)}
                            {Number(p.mrp) > Number(p.selling_price) && <> · Disc {money(p.mrp - p.selling_price)}</>}
                            {' '}· GST {Number(p.gst_percent)}% ·{' '}
                          </>
                        )}
                        In stock: {qty(p.stock_qty)} {p.unit}{short && ' — not enough stock'}
                      </div>
                    )}
                  </td>
                  <td className="py-1 pr-2">
                    <input type="number" min="0.001" step="any" value={it.qty} onChange={(e) => update(i, { qty: e.target.value })} onKeyDown={(e) => onRowEnter(e, i)} required className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
                  </td>
                  <td className="py-1 pr-2">
                    <input type="number" min="0" step="any" value={it.rate} onChange={(e) => update(i, { rate: e.target.value })} onKeyDown={(e) => onRowEnter(e, i)} required className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
                  </td>
                  <td className="py-2 pr-2 text-right">{money((Number(it.qty) || 0) * (Number(it.rate) || 0))}</td>
                  <td className="py-1 text-right whitespace-nowrap">
                    <button type="button" onClick={() => addLine(i)} className="px-1 text-lg leading-none text-indigo-600 hover:text-indigo-800" aria-label="Add line below">+</button>
                    {items.length > 1 && (
                      <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} className="px-2 text-lg leading-none text-slate-400 hover:text-red-600" aria-label="Remove line">×</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <button type="button" onClick={() => addLine(items.length - 1)} className="text-sm text-indigo-600 hover:underline">
          + Add line
        </button>
        {showPricing && <span className="text-xs text-slate-500">Enter: next line · Alt+N: new line · Ctrl+Enter: save bill</span>}
      </div>
    </div>
  );
}
