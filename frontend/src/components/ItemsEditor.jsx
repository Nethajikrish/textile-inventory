import { useEffect, useRef, useState } from 'react';
import { SearchSelect } from './ui.jsx';
import { money, productLabel, qty } from '../utils/format';
import { lineAmount } from '../utils/bill';

export const blankItem = () => ({ product_id: '', qty: '1', rate: '', discount_type: 'percent', discount_value: '' });
export const itemsTotal = (items) => items.reduce((sum, it) => sum + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0);

const sameCode = (p, text) => [p.barcode, p.sku].some((c) => c && c.toLowerCase() === text.toLowerCase());

// Line items for purchases and sales.
// priceField: product field used to prefill the rate ("purchase_price" or "selling_price")
// checkStock: warn when qty exceeds what's in stock (sales)
// showPricing: show MRP, GST rate and a discount per line (sales; prices include GST)
// autoNext: picking or scanning a product moves to an empty line, kept at the bottom and left out of the saved bill
export default function ItemsEditor({ products, items, onChange, priceField, checkStock = false, showPricing = false, autoNext = false }) {
  const byId = Object.fromEntries(products.map((p) => [String(p.id), p]));
  const [unknownCode, setUnknownCode] = useState('');

  const update = (i, patch) => onChange(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const pick = (i, productId) => {
    setUnknownCode('');
    if (!productId) return update(i, { product_id: '', rate: '' });
    const dup = items.findIndex((it, j) => j !== i && it.product_id === productId);
    // Product already on another line: add this line's qty there and drop this line.
    const added = Number(items[i].qty) || 1;
    let next = dup === -1
      ? items.map((it, j) => (j === i ? { ...it, product_id: productId, rate: byId[productId]?.[priceField] ?? '' } : it))
      : items.flatMap((it, j) => {
        if (j === i) return [];
        if (j === dup) return [{ ...it, qty: (Number(it.qty) || 0) + added }];
        return [it];
      });
    if (autoNext) {
      if (next[next.length - 1].product_id) next = [...next, blankItem()];
      focusRow.current = next.length - 1;
    }
    onChange(next);
  };

  // Keyboard entry: the product search of the row to focus after a keyboard add or move.
  const productRefs = useRef([]);
  // Lines may arrive filled (from a quotation): start on the empty bottom line so a scan can't replace a product.
  const focusRow = useRef(autoNext ? items.length - 1 : null);
  useEffect(() => {
    if (focusRow.current == null) return;
    productRefs.current[focusRow.current]?.focus();
    focusRow.current = null;
  });

  const addLine = (after) => {
    focusRow.current = after + 1;
    onChange([...items.slice(0, after + 1), blankItem(), ...items.slice(after + 1)]);
  };

  // The empty line at the bottom is used before another one is added.
  const addAtEnd = () => {
    const last = items.length - 1;
    if (autoNext && !items[last].product_id) productRefs.current[last]?.focus();
    else addLine(last);
  };

  // Enter in qty/rate goes to the next line, adding one after the last.
  const onRowEnter = (e, i) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (i === items.length - 1) addAtEnd();
    else productRefs.current[i + 1]?.focus();
  };

  // Alt+N adds a line from anywhere on the page.
  useEffect(() => {
    const onKey = (e) => {
      if (e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        addAtEnd();
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
              <th className="w-24 py-2 pr-2">Qty</th>
              <th className="w-28 py-2 pr-2">{showPricing ? 'Price (incl. GST)' : 'Rate'}</th>
              {showPricing && <th className="w-36 py-2 pr-2">Discount</th>}
              <th className="w-32 py-2 pr-2 text-right">Amount</th>
              <th className="w-16" />
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => {
              const p = byId[it.product_id];
              const short = checkStock && p && Number(it.qty) > Number(p.stock_qty);
              // The empty bottom line doesn't stop the bill being saved.
              const needed = !autoNext || !!it.product_id || items.length === 1;
              return (
                <tr key={i} className="align-top">
                  <td className="py-1 pr-2">
                    <SearchSelect
                      inputRef={(el) => { productRefs.current[i] = el; }}
                      value={it.product_id}
                      onChange={(e) => pick(i, e.target.value)}
                      options={products}
                      getLabel={productLabel}
                      placeholder={autoNext ? 'Scan barcode or search product...' : 'Search product...'}
                      exactMatch={autoNext ? sameCode : undefined}
                      onNoMatch={setUnknownCode}
                      required={needed}
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
                    <input type="number" min="0.001" step="any" value={it.qty} onChange={(e) => update(i, { qty: e.target.value })} onKeyDown={(e) => onRowEnter(e, i)} required={needed} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
                  </td>
                  <td className="py-1 pr-2">
                    <input type="number" min="0" step="any" value={it.rate} onChange={(e) => update(i, { rate: e.target.value })} onKeyDown={(e) => onRowEnter(e, i)} required={needed} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
                  </td>
                  {showPricing && (
                    <td className="py-1 pr-2">
                      <div className="flex">
                        <input
                          type="number"
                          min="0"
                          max={it.discount_type === 'percent' ? '100' : undefined}
                          step="any"
                          value={it.discount_value}
                          onChange={(e) => update(i, { discount_value: e.target.value })}
                          onKeyDown={(e) => onRowEnter(e, i)}
                          placeholder="0"
                          aria-label="Line discount"
                          className="w-full min-w-0 rounded-l border border-slate-300 px-2 py-1.5 text-sm"
                        />
                        <select
                          value={it.discount_type}
                          onChange={(e) => update(i, { discount_type: e.target.value })}
                          aria-label="Line discount type"
                          className="rounded-r border border-l-0 border-slate-300 bg-white px-1 py-1.5 text-sm"
                        >
                          <option value="percent">%</option>
                          <option value="amount">₹</option>
                        </select>
                      </div>
                    </td>
                  )}
                  <td className="py-2 pr-2 text-right">{money(lineAmount(it))}</td>
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
      {unknownCode && <div className="text-sm text-red-600">No product found for "{unknownCode}"</div>}
      <div className="flex flex-wrap items-center gap-4">
        <button type="button" onClick={addAtEnd} className="text-sm text-indigo-600 hover:underline">
          + Add line
        </button>
        {showPricing && <span className="text-xs text-slate-500">Scan: adds the product, qty 1, and moves to the next line · Alt+N: new line · Ctrl+Enter: save</span>}
      </div>
    </div>
  );
}
