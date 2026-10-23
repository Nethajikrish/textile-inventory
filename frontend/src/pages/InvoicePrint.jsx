import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { addressLines, useCompany } from '../context/CompanyContext.jsx';
import { CompanyBlock, PartyBlock, Stamp, TotalLine as Line } from '../components/PrintParts.jsx';
import { gstSummary } from '../utils/bill';
import { fmtDate, fmtTime, money, qty, rupeesInWords } from '../utils/format';

const FORMATS = [{ key: 'a4', label: 'A4 / PDF' }, { key: 'receipt', label: '80 mm receipt' }];

// Figures shared by the A4 and receipt layouts.
function billFigures(sale) {
  const inclusive = Number(sale.gst_inclusive) === 1;
  const mrpTotal = sale.items.reduce((s, it) => s + Number(it.qty) * Number(it.mrp), 0);
  const subtotal = Number(sale.subtotal);
  const discount = Number(sale.discount_amount);
  const productDiscount = Math.max(0, mrpTotal - subtotal);
  const gstRows = inclusive
    ? gstSummary(sale.items)
    : [{ rate: Number(sale.tax_percent), taxable: Number(sale.taxable_amount), cgst: Number(sale.cgst_amount), sgst: Number(sale.sgst_amount) }];
  return {
    inclusive,
    mrpTotal,
    productDiscount,
    discount,
    discountLabel: `Discount${sale.discount_type === 'percent' && discount > 0 ? ` (${Number(sale.discount_value)}%)` : ''}`,
    roundOff: Number(sale.round_off),
    saved: inclusive ? productDiscount + discount : 0,
    gstRows,
  };
}

const signed = (n) => `${n > 0 ? '+' : '-'} ${money(Math.abs(n))}`;

// Printable bill. "Print / Save as PDF" uses the browser's print dialog.
// ?copy=duplicate marks the print as a DUPLICATE (reprint for the customer).
export default function InvoicePrint() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const duplicate = params.get('copy') === 'duplicate';
  const [sale, setSale] = useState(null);
  const [error, setError] = useState('');
  const company = useCompany();
  const [format, setFormat] = useState(() => {
    try { return localStorage.getItem('billFormat') === 'receipt' ? 'receipt' : 'a4'; } catch { return 'a4'; }
  });
  const pickFormat = (f) => {
    setFormat(f);
    try { localStorage.setItem('billFormat', f); } catch { /* ignore */ }
  };

  useEffect(() => {
    api.get(`/sales/${id}`).then((r) => setSale(r.data.data)).catch(() => setError('Invoice not found'));
  }, [id]);

  useEffect(() => {
    if (sale) document.title = `Bill ${sale.invoice_no}${duplicate ? ' (Duplicate)' : ''}`;
    return () => { document.title = company.company_name; };
  }, [sale, duplicate, company.company_name]);

  if (error) return <div className="p-8 text-red-600">{error}</div>;
  if (!sale) return <div className="p-8 text-slate-500">Loading...</div>;

  const f = billFigures(sale);
  const toggle = (options, value, onPick) => (
    <div className="inline-flex overflow-hidden rounded border border-slate-300 text-sm">
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onPick(o.key)}
          className={`px-3 py-2 ${value === o.key ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );

  const toolbar = (
    <div className="mx-auto mb-4 flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 print:hidden">
      <Link to="/sales?tab=list" className="text-sm text-indigo-600 hover:underline">← Back to sales</Link>
      <div className="flex flex-wrap items-center gap-3">
        {toggle(
          [{ key: 'original', label: 'Original' }, { key: 'duplicate', label: 'Duplicate' }],
          duplicate ? 'duplicate' : 'original',
          (k) => setParams(k === 'duplicate' ? { copy: 'duplicate' } : {}),
        )}
        {toggle(FORMATS, format, pickFormat)}
        <button onClick={() => window.print()} className="rounded bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700">
          {format === 'receipt' ? 'Print receipt' : 'Print / Save as PDF'}
        </button>
      </div>
    </div>
  );

  if (format === 'receipt') {
    return (
      <div className="min-h-screen bg-slate-100 py-6 print:bg-white print:py-0">
        {toolbar}
        <Receipt sale={sale} company={company} f={f} duplicate={duplicate} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 py-6 print:bg-white print:py-0">
      {toolbar}

      <div className="relative mx-auto max-w-3xl bg-white p-8 text-sm text-slate-800 shadow print:max-w-none print:p-0 print:shadow-none">
        {sale.status === 'cancelled' && <Stamp>Cancelled</Stamp>}

        <div className="flex justify-between border-b pb-4">
          <CompanyBlock />
          <div className="text-right">
            <div className="text-2xl font-semibold uppercase tracking-wide text-slate-700">Tax Invoice</div>
            {duplicate && <div className="mt-1 inline-block rounded border border-slate-500 px-2 text-xs font-bold uppercase tracking-widest">Duplicate copy</div>}
            <div className="mt-1">Bill No: <span className="font-mono text-base font-semibold">{sale.invoice_no}</span></div>
            <div>Date: {fmtDate(sale.sale_date)} {fmtTime(sale.sale_time)}</div>
            {sale.counter && <div>Counter: {sale.counter}</div>}
          </div>
        </div>

        <PartyBlock title="Bill to" name={sale.customer} address={sale.customer_address} phone={sale.customer_phone} gstin={sale.customer_gstin} />

        <table className="mt-4 w-full">
          <thead>
            <tr className="border-b-2 border-slate-300 text-left text-xs uppercase text-slate-500">
              <th className="py-2">#</th>
              <th className="py-2">Description</th>
              <th className="py-2 text-right">Qty</th>
              <th className="py-2 text-right">MRP</th>
              <th className="py-2 text-right">Price</th>
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {sale.items.map((it, i) => (
              <tr key={it.id} className="border-b border-slate-200">
                <td className="py-2 align-top">{i + 1}</td>
                <td className="py-2">
                  <div>{it.name}</div>
                  <div className="text-xs text-slate-500">
                    {[it.sku, it.brand, it.model, it.color, it.size && `Size ${it.size}`, `GST ${Number(it.gst_percent)}%`].filter(Boolean).join(' · ')}
                  </div>
                </td>
                <td className="py-2 text-right align-top">{qty(it.qty)} {it.unit}</td>
                <td className={`py-2 text-right align-top ${Number(it.mrp) > Number(it.rate) ? 'text-slate-400 line-through' : ''}`}>{money(it.mrp)}</td>
                <td className="py-2 text-right align-top font-medium">{money(it.rate)}</td>
                <td className="py-2 text-right align-top">{money(it.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 flex justify-between gap-6">
          <div className="space-y-3 text-slate-600">
            <GstTable rows={f.gstRows} />
            {f.inclusive && <div className="text-xs">Prices are inclusive of GST.</div>}
            <div>
              <div className="text-xs uppercase text-slate-500">Amount in words</div>
              <div className="font-medium text-slate-800">{rupeesInWords(sale.total_amount)}</div>
            </div>
            {sale.notes && <div>Notes: {sale.notes}</div>}
          </div>
          <div className="w-64 shrink-0 space-y-1">
            {f.productDiscount > 0.004 && (
              <>
                <Line label="Total MRP" value={money(f.mrpTotal)} />
                <Line label="Product discount" value={`- ${money(f.productDiscount)}`} />
              </>
            )}
            <Line label="Subtotal" value={money(sale.subtotal)} />
            {f.discount > 0 && <Line label={f.discountLabel} value={`- ${money(f.discount)}`} />}
            {!f.inclusive && (
              <>
                <Line label="CGST" value={`+ ${money(sale.cgst_amount)}`} />
                <Line label="SGST" value={`+ ${money(sale.sgst_amount)}`} />
              </>
            )}
            {f.roundOff !== 0 && <Line label="Round off" value={signed(f.roundOff)} />}
            <Line label="Net amount" value={money(sale.total_amount)} bold />
            {f.saved > 0.5 && <div className="pt-1 text-right text-sm font-semibold text-green-700">You saved {money(f.saved)}</div>}
          </div>
        </div>

        <div className="mt-16 flex justify-between text-xs text-slate-500">
          <span>Thank you for your business.</span>
          <span className="border-t border-slate-400 pt-1">Authorised signatory, {company.company_name}</span>
        </div>
      </div>
    </div>
  );
}

function GstTable({ rows, small = false }) {
  const total = rows.reduce((t, r) => ({ taxable: t.taxable + r.taxable, cgst: t.cgst + r.cgst, sgst: t.sgst + r.sgst }), { taxable: 0, cgst: 0, sgst: 0 });
  const cell = small ? 'py-0.5' : 'px-2 py-1';
  return (
    <table className={`border-collapse ${small ? 'w-full text-[8pt]' : 'text-xs'}`}>
      <thead>
        <tr className={small ? 'border-b border-dashed border-black' : 'border-b border-slate-300 text-slate-500'}>
          <th className={`${cell} text-left`}>GST</th>
          <th className={`${cell} text-right`}>Taxable</th>
          <th className={`${cell} text-right`}>CGST</th>
          <th className={`${cell} text-right`}>SGST</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.rate}>
            <td className={cell}>{r.rate}%</td>
            <td className={`${cell} text-right`}>{money(r.taxable)}</td>
            <td className={`${cell} text-right`}>{money(r.cgst)}<span className="text-[0.85em]"> ({r.rate / 2}%)</span></td>
            <td className={`${cell} text-right`}>{money(r.sgst)}<span className="text-[0.85em]"> ({r.rate / 2}%)</span></td>
          </tr>
        ))}
        {rows.length > 1 && (
          <tr className={`font-semibold ${small ? 'border-t border-dashed border-black' : 'border-t border-slate-300'}`}>
            <td className={cell}>Total</td>
            <td className={`${cell} text-right`}>{money(total.taxable)}</td>
            <td className={`${cell} text-right`}>{money(total.cgst)}</td>
            <td className={`${cell} text-right`}>{money(total.sgst)}</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

// 80 mm thermal receipt (72 mm printable), e.g. RETSOL RTP-81. Choose the receipt printer and Margins: None when printing.
function Receipt({ sale, company, f, duplicate }) {
  const R = ({ label, value, bold }) => (
    <div className={`flex justify-between gap-2 ${bold ? 'text-[11pt] font-bold' : ''}`}>
      <span>{label}</span>
      <span className="whitespace-nowrap">{value}</span>
    </div>
  );
  const hr = <div className="my-1 border-t border-dashed border-black" />;

  return (
    <div
      className="relative mx-auto bg-white p-[2mm] text-black shadow print:m-0 print:p-0 print:shadow-none"
      style={{ width: '72mm', fontSize: '9pt', lineHeight: 1.3, fontFamily: 'Arial, Helvetica, sans-serif' }}
    >
      <style>{'@page { margin: 0; }'}</style>
      <div className="text-center">
        <div className="text-[12pt] font-bold uppercase">{company.company_name}</div>
        {addressLines(company).map((l) => <div key={l}>{l}</div>)}
        {company.phone && <div>Ph: {company.phone}</div>}
        {company.gstin && <div>GSTIN: {company.gstin}</div>}
        <div className="mt-1 font-bold">{sale.status === 'cancelled' ? '*** CANCELLED ***' : 'TAX INVOICE'}</div>
        {duplicate && <div className="font-bold">*** DUPLICATE COPY ***</div>}
      </div>
      {hr}
      <div className="text-[10pt] font-bold">Bill No: {sale.invoice_no}</div>
      <R label={`Date: ${fmtDate(sale.sale_date)}`} value={fmtTime(sale.sale_time)} />
      {sale.counter && <div>Counter: {sale.counter}</div>}
      <div>Customer: {sale.customer}</div>
      {sale.customer_phone && <div>Ph: {sale.customer_phone}</div>}
      {sale.customer_gstin && <div>GSTIN: {sale.customer_gstin}</div>}
      {hr}
      <div className="flex justify-between font-bold">
        <span>Item</span>
        <span>Amount</span>
      </div>
      {hr}
      {sale.items.map((it) => (
        <div key={it.id} className="mb-1">
          <div className="font-semibold">{it.name}{it.size ? ` (${it.size})` : ''}</div>
          {Number(it.mrp) > Number(it.rate) && (
            <div className="text-[8pt]">MRP {money(it.mrp)} · Disc {money(Number(it.mrp) - Number(it.rate))}</div>
          )}
          <R label={`${qty(it.qty)} ${it.unit} × ${money(it.rate)}`} value={money(it.amount)} />
        </div>
      ))}
      {hr}
      <R label="Subtotal" value={money(sale.subtotal)} />
      {f.discount > 0 && <R label={f.discountLabel} value={`- ${money(f.discount)}`} />}
      {!f.inclusive && (
        <>
          <R label="CGST" value={`+ ${money(sale.cgst_amount)}`} />
          <R label="SGST" value={`+ ${money(sale.sgst_amount)}`} />
        </>
      )}
      {f.roundOff !== 0 && <R label="Round off" value={signed(f.roundOff)} />}
      {hr}
      <R label="NET AMOUNT" value={money(sale.total_amount)} bold />
      {hr}
      <GstTable rows={f.gstRows} small />
      {f.inclusive && <div className="text-[8pt]">Prices inclusive of GST</div>}
      {f.saved > 0.5 && <div className="mt-1 text-center font-bold">You saved {money(f.saved)}</div>}
      <div className="mt-1 text-[8pt]">{rupeesInWords(sale.total_amount)}</div>
      {sale.notes && <div className="mt-1 text-[8pt]">Note: {sale.notes}</div>}
      <div className="mt-2 text-center">Thank you! Visit again.</div>
    </div>
  );
}
