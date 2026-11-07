import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import Barcode from '../components/Barcode.jsx';
import { SearchSelect } from '../components/ui.jsx';
import { money, productLabel } from '../utils/format';

// Sticker sizes. Thermal sizes print one sticker per page; A4 lays them out in a grid.
const SIZES = {
  // Bar Code Printer R220 with a roll of two 50 mm labels side by side, measured 50 mm apart. The driver's page is about 102 mm wide and starts left of the
  // roll, so offset moves the first label onto the roll; padX keeps the print inside that page on the second label.
  roll102x2: { name: '2 stickers across, 50 mm each (Bar Code Printer R220)', w: 50, font: 6, bar: 6, pad: 1.5, padX: 6, sheet: false, across: 2, gutter: 0, pageW: 102, offset: 7.5, offsetY: 2, barW: '100%', keyFont: '0.8em' },
  // 80 mm roll with two labels side by side. 34 + 4 + 34 mm stays inside the printer's 72 mm print width; the 4 mm gutter sits on the roll's centre gap.
  roll80x2: { name: '80 mm roll – 2 stickers across (RTP-81)', w: 34, font: 6, bar: 5.5, pad: 1, sheet: false, across: 2, gutter: 4, pageW: 80, offset: 4, barW: '100%', keyFont: '0.8em' },
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

// Blank liner between two rows of labels on the 2-across roll.
const ROW_GAP = 3;

const saved = (key, fallback) => {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
};

export default function Labels() {
  const [params] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [rows, setRows] = useState(() => parseItems(params.get('items')));
  const [size, setSize] = useState(() => (SIZES[saved('barcodeStickerSize')] ? saved('barcodeStickerSize') : 'roll102x2'));
  const [rowPitch, setRowPitch] = useState(() => saved('stickerRowPitch', '25'));
  const [shift, setShift] = useState(() => saved('barcodeStickerShift', '0'));
  const [shiftDown, setShiftDown] = useState(() => saved('barcodeStickerShiftDown', '0'));

  useEffect(() => {
    api.get('/products', { params: { all: 1 } }).then((r) => setProducts(r.data.data));
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem('barcodeStickerSize', size);
      localStorage.setItem('stickerRowPitch', rowPitch);
      localStorage.setItem('barcodeStickerShift', shift);
      localStorage.setItem('barcodeStickerShiftDown', shiftDown);
    } catch { /* ignore */ }
  }, [size, rowPitch, shift, shiftDown]);

  const byId = useMemo(() => Object.fromEntries(products.map((p) => [String(p.id), p])), [products]);
  const pitch = Math.max(15, Number(rowPitch) || 25);
  const s = SIZES[size].across ? { ...SIZES[size], h: pitch - ROW_GAP } : SIZES[size];
  const stickers = rows.flatMap((r) => (byId[r.id] ? Array(r.copies).fill(byId[r.id]) : []));
  const stickerRows = [];
  if (s.across) for (let i = 0; i < stickers.length; i += s.across) stickerRows.push(stickers.slice(i, i + s.across));

  const setCopies = (id, n) => setRows(rows.map((r) => (r.id === id ? { ...r, copies: n } : r)));
  const add = (id) => {
    if (!id) return;
    setRows(rows.some((r) => r.id === id) ? rows : [...rows, { id, copies: 1 }]);
  };

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      {/* Page size for the printer: one sticker or row of stickers per page, or A4 */}
      <style>{s.sheet
        ? '@page { size: A4; margin: 10mm 6mm; }'
        : s.across
          ? `@page { size: ${s.pageW}mm ${pitch}mm; margin: 0; }`
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
            {s.across && (
              <>
                <label className="block text-xs text-slate-600">
                  Row height incl. gap (mm)
                  <input type="number" min="15" step="0.5" value={rowPitch} onChange={(e) => setRowPitch(e.target.value)} className="mt-1 block w-24 rounded border border-slate-300 px-2 py-1.5 text-sm" />
                </label>
                <label className="block text-xs text-slate-600">
                  Move right (mm, minus = left)
                  <input type="number" step="0.5" value={shift} onChange={(e) => setShift(e.target.value)} className="mt-1 block w-24 rounded border border-slate-300 px-2 py-1.5 text-sm" />
                </label>
                <label className="block text-xs text-slate-600">
                  Move down (mm, minus = up)
                  <input type="number" step="0.5" value={shiftDown} onChange={(e) => setShiftDown(e.target.value)} className="mt-1 block w-24 rounded border border-slate-300 px-2 py-1.5 text-sm" />
                </label>
              </>
            )}
          </div>

          {size === 'roll102x2' && (
            <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">
              R220 setup: in the print dialog set Margins to <b>None</b> and Scale to <b>100%</b>. Test with one row first: if both stickers sit too far left or right
              on their labels, measure how far and enter it in Move right. If the top or bottom line is cut off, use Move down. Both stickers move together.
            </p>
          )}

          {size === 'roll80x2' && (
            <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">
              RTP-81 setup: in the print dialog choose the RTP-81, set Margins to <b>None</b> and Scale to <b>100%</b>. In the printer driver preferences turn the
              cutter <b>off</b> and turn off any <b>logo</b> printing. Test with one row first: if stickers creep up or down the roll, measure from the top of one
              label to the top of the next and enter it as Row height.
            </p>
          )}

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
        {s.across
          ? stickerRows.map((row, i) => (
            <div
              key={i}
              className="overflow-hidden bg-slate-200 print:bg-white"
              style={{ width: `${s.pageW}mm`, height: `${pitch}mm`, breakBefore: i === 0 ? 'auto' : 'page', breakInside: 'avoid' }}
            >
              <div className="flex" style={{ gap: `${s.gutter}mm`, transform: `translate(${s.offset + (Number(shift) || 0)}mm, ${(s.offsetY || 0) + (Number(shiftDown) || 0)}mm)` }}>
                {/* An odd sticker keeps the left label; the right one stays blank */}
                {[0, 1].map((n) => (row[n]
                  ? <Sticker key={n} p={row[n]} s={s} first />
                  : <div key={n} style={{ width: `${s.w}mm` }} />))}
              </div>
            </div>
          ))
          : stickers.map((p, i) => (
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
        width: `${s.w}mm`, height: `${s.h}mm`, padding: `${s.pad}mm ${s.padX ?? s.pad}mm`, fontSize: `${s.font}pt`, lineHeight: 1.12,
        fontFamily: 'Arial, Helvetica, sans-serif',
        breakBefore: s.sheet || first ? 'auto' : 'page', breakInside: 'avoid', boxSizing: 'border-box',
      }}
    >
      <table className="w-full border-collapse uppercase">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <td className="whitespace-nowrap pr-[1.5mm] align-top font-bold" style={{ width: '1%', fontSize: s.keyFont }}>{k}</td>
              <td className="pr-[1mm] align-top font-bold" style={{ width: '1%' }}>:</td>
              <td className={`truncate ${s.across ? 'font-bold' : 'font-extrabold'}`} style={{ maxWidth: 0 }}>{v || ''}</td>
            </tr>
          ))}
          <tr>
            <td className="whitespace-nowrap pr-[1.5mm] align-middle font-bold" style={{ fontSize: s.keyFont }}>PRICE</td>
            <td className="pr-[1mm] align-middle font-bold">:</td>
            <td className="whitespace-nowrap font-black" style={{ fontSize: '1.35em' }}>
              {money(p.selling_price)}
              {discounted && !s.across && <span className="ml-[2mm] font-semibold line-through" style={{ fontSize: '0.6em' }}>{money(p.mrp)}</span>}
            </td>
          </tr>
        </tbody>
      </table>
      <div className="mt-auto">
        <Barcode value={p.barcode || p.sku} style={{ width: s.barW || '85%', height: `${s.bar}mm`, display: 'block' }} />
        <div className="font-bold tracking-wider" style={{ fontSize: '0.8em' }}>{p.barcode || p.sku}</div>
      </div>
    </div>
  );
}
