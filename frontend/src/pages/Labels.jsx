import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import Barcode from '../components/Barcode.jsx';
import { SearchSelect } from '../components/ui.jsx';
import { money, productLabel } from '../utils/format';

// Sticker sizes. Thermal sizes print one sticker per page; A4 lays them out in a grid.
const SIZES = {
  // 3" receipt printers (e.g. RETSOL RTP-81) with continuous sticker roll; the cutter cuts after each sticker.
  roll80: { name: '80 mm roll – thermal receipt printer (RTP-81)', w: 80, h: 50, font: 13, bar: 11, pad: 4, sheet: false },
  '50x25': { name: 'Sticker 50 × 25 mm', w: 50, h: 25, font: 7.5, bar: 5.5, pad: 1.5, sheet: false },
  '75x50': { name: 'Sticker 75 × 50 mm', w: 75, h: 50, font: 12.5, bar: 11, pad: 3, sheet: false },
  a4: { name: 'A4 sheet (3 × 7, 63.5 × 38 mm)', w: 63.5, h: 38, font: 9.5, bar: 8, pad: 2.5, sheet: true },
};

// URL: /labels?items=12:5,14:1  (product id : number of stickers)
const parseItems = (s) =>
  (s || '').split(',').map((x) => x.split(':')).filter(([id]) => id)
    .map(([id, n]) => ({ id: String(id), copies: Math.max(1, Math.floor(Number(n) || 1)) }));

export default function Labels() {
  const [params] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [rows, setRows] = useState(() => parseItems(params.get('items')));
  const [size, setSize] = useState(() => {
    try { return SIZES[localStorage.getItem('labelSize')] ? localStorage.getItem('labelSize') : 'roll80'; } catch { return 'roll80'; }
  });

  useEffect(() => {
    api.get('/products', { params: { all: 1 } }).then((r) => setProducts(r.data.data));
  }, []);
  useEffect(() => { try { localStorage.setItem('labelSize', size); } catch { /* ignore */ } }, [size]);

  const byId = useMemo(() => Object.fromEntries(products.map((p) => [String(p.id), p])), [products]);
  const s = SIZES[size];
  const stickers = rows.flatMap((r) => (byId[r.id] ? Array(r.copies).fill(byId[r.id]) : []));

  const setCopies = (id, n) => setRows(rows.map((r) => (r.id === id ? { ...r, copies: n } : r)));
  const add = (id) => {
    if (!id) return;
    setRows(rows.some((r) => r.id === id) ? rows : [...rows, { id, copies: 1 }]);
  };

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      {/* Page size for the printer: one sticker per page, or A4 */}
      <style>{s.sheet
        ? '@page { size: A4; margin: 10mm 6mm; }'
        : `@page { size: ${s.w}mm ${s.h}mm; margin: 0; }`}</style>

      <div className="mx-auto max-w-4xl space-y-4 p-4 print:hidden">
        <div className="flex items-center justify-between">
          <Link to="/products" className="text-sm text-indigo-600 hover:underline">← Back to products</Link>
          <button
            onClick={() => window.print()}
            disabled={!stickers.length}
            className="rounded bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            Print {stickers.length} sticker{stickers.length === 1 ? '' : 's'}
          </button>
        </div>

        <div className="space-y-3 rounded-lg bg-white p-4 shadow">
          <div className="flex flex-wrap items-end gap-4">
            <label className="block text-xs text-slate-600">
              Sticker size
              <select value={size} onChange={(e) => setSize(e.target.value)} className="mt-1 block rounded border border-slate-300 px-2 py-1.5 text-sm">
                {Object.entries(SIZES).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
              </select>
            </label>
          </div>

          {size === 'roll80' && (
            <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">
              RTP-81 setup: load an 80 mm continuous thermal <b>sticker</b> roll (plain receipt paper is not adhesive). In the print dialog choose the
              RTP-81, set Margins to <b>None</b> and Scale to <b>100%</b>. In the printer driver preferences set the cutter to <b>cut after each page</b> so
              every sticker is cut separately.
            </p>
          )}

          <div className="w-full max-w-xl">
            <SearchSelect options={products} value="" onChange={(e) => add(e.target.value)} getLabel={productLabel} placeholder="Add product (search or scan)..." />
          </div>

          {rows.length > 0 && (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-slate-500">
                <tr><th className="py-1">Product</th><th className="w-28 py-1">Stickers</th><th className="w-8" /></tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const p = byId[r.id];
                  return (
                    <tr key={r.id} className="border-t">
                      <td className="py-1.5">{p ? productLabel(p) : `Product #${r.id} (not found)`}</td>
                      <td className="py-1.5">
                        <input type="number" min="1" value={r.copies} onChange={(e) => setCopies(r.id, Math.max(1, Math.floor(Number(e.target.value) || 1)))} className="w-20 rounded border border-slate-300 px-2 py-1" />
                      </td>
                      <td className="text-right">
                        <button onClick={() => setRows(rows.filter((x) => x.id !== r.id))} className="px-2 text-lg leading-none text-slate-400 hover:text-red-600" aria-label="Remove">×</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {!rows.length && <p className="text-sm text-slate-500">Add products above to print their barcode stickers.</p>}
        </div>

        {stickers.length > 0 && <div className="text-xs uppercase text-slate-500">Preview</div>}
      </div>

      <div className={s.sheet ? 'mx-auto flex max-w-[210mm] flex-wrap gap-[2mm] px-4 pb-8 print:max-w-none print:p-0' : 'flex flex-wrap justify-center gap-3 px-4 pb-8 print:block print:p-0'}>
        {stickers.map((p, i) => (
          <Sticker key={i} p={p} s={s} first={i === 0} />
        ))}
      </div>
    </div>
  );
}

// BRAND / MODEL / SIZE / PRICE in large bold type, then the barcode and its code.
function Sticker({ p, s, first }) {
  const rows = [
    ['BRAND', p.brand],
    ['MODEL', p.model || p.name],
    ['SIZE', p.size],
  ];
  const discounted = Number(p.mrp) > Number(p.selling_price);

  return (
    <div
      className="flex flex-col overflow-hidden bg-white text-black shadow print:shadow-none"
      style={{
        width: `${s.w}mm`, height: `${s.h}mm`, padding: `${s.pad}mm`, fontSize: `${s.font}pt`, lineHeight: 1.12,
        fontFamily: 'Arial, Helvetica, sans-serif',
        breakBefore: s.sheet || first ? 'auto' : 'page', breakInside: 'avoid', boxSizing: 'border-box',
      }}
    >
      <table className="w-full border-collapse uppercase">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <td className="whitespace-nowrap pr-[1.5mm] align-top font-bold" style={{ width: '1%' }}>{k}</td>
              <td className="pr-[1mm] align-top font-bold" style={{ width: '1%' }}>:</td>
              <td className="truncate font-extrabold" style={{ maxWidth: 0 }}>{v || ''}</td>
            </tr>
          ))}
          <tr>
            <td className="whitespace-nowrap pr-[1.5mm] align-middle font-bold">PRICE</td>
            <td className="pr-[1mm] align-middle font-bold">:</td>
            <td className="whitespace-nowrap font-black" style={{ fontSize: '1.35em' }}>
              {money(p.selling_price)}
              {discounted && <span className="ml-[2mm] font-semibold line-through" style={{ fontSize: '0.6em' }}>{money(p.mrp)}</span>}
            </td>
          </tr>
        </tbody>
      </table>
      <div className="mt-auto">
        <Barcode value={p.barcode || p.sku} style={{ width: '85%', height: `${s.bar}mm`, display: 'block' }} />
        <div className="font-bold tracking-wider" style={{ fontSize: '0.8em' }}>{p.barcode || p.sku}</div>
      </div>
    </div>
  );
}
