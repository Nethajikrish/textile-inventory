import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../services/api';
import { addressLines, useCompany } from '../context/CompanyContext.jsx';
import { CompanyBlock, PartyBlock, Stamp, TotalLine as Line } from '../components/PrintParts.jsx';
import { fmtDate, money, qty, rupeesInWords } from '../utils/format';

const FORMATS = [{ key: 'a4', label: 'A4 / PDF' }, { key: 'receipt', label: '80 mm receipt' }];

// Printable invoice. "Print / Save as PDF" uses the browser's print dialog.
export default function InvoicePrint() {
  const { id } = useParams();
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
    if (sale) document.title = `Invoice ${sale.invoice_no}`;
    return () => { document.title = company.company_name; };
  }, [sale, company.company_name]);

  if (error) return <div className="p-8 text-red-600">{error}</div>;
  if (!sale) return <div className="p-8 text-slate-500">Loading...</div>;

  const toolbar = (
    <div className="mx-auto mb-4 flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 print:hidden">
      <Link to="/sales?tab=list" className="text-sm text-indigo-600 hover:underline">← Back to sales</Link>
      <div className="flex items-center gap-3">
        <div className="inline-flex overflow-hidden rounded border border-slate-300 text-sm">
          {FORMATS.map((f) => (
            <button
              key={f.key}
              onClick={() => pickFormat(f.key)}
              className={`px-3 py-2 ${format === f.key ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
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
        <Receipt sale={sale} company={company} />
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
            <div className="mt-1">No: <span className="font-mono font-medium">{sale.invoice_no}</span></div>
            <div>Date: {fmtDate(sale.sale_date)}</div>
          </div>
        </div>

        <PartyBlock title="Bill to" name={sale.customer} address={sale.customer_address} phone={sale.customer_phone} gstin={sale.customer_gstin} />

        <table className="mt-4 w-full">
          <thead>
            <tr className="border-b-2 border-slate-300 text-left text-xs uppercase text-slate-500">
              <th className="py-2">#</th>
              <th className="py-2">Description</th>
              <th className="py-2 text-right">Qty</th>
              <th className="py-2 text-right">Rate</th>
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
                    {[it.sku, it.color, it.lot_no && `Lot ${it.lot_no}`].filter(Boolean).join(' · ')}
                  </div>
                </td>
                <td className="py-2 text-right align-top">{qty(it.qty)} {it.unit}</td>
                <td className="py-2 text-right align-top">{money(it.rate)}</td>
                <td className="py-2 text-right align-top">{money(it.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 flex justify-between gap-6">
          <div className="text-slate-600">
            <div className="text-xs uppercase text-slate-500">Amount in words</div>
            <div className="font-medium text-slate-800">{rupeesInWords(sale.total_amount)}</div>
            {sale.notes && <div className="mt-3">Notes: {sale.notes}</div>}
          </div>
          <div className="w-64 shrink-0 space-y-1">
            <Line label="Subtotal" value={money(sale.subtotal)} />
            {Number(sale.discount_amount) > 0 && (
              <>
                <Line
                  label={`Offer${sale.discount_type === 'percent' ? ` (${Number(sale.discount_value)}%)` : ''}`}
                  value={`- ${money(sale.discount_amount)}`}
                />
                <Line label="Taxable value" value={money(sale.subtotal - sale.discount_amount)} />
              </>
            )}
            <Line label={`GST (${Number(sale.tax_percent)}%)`} value={money(sale.tax_amount)} />
            <Line label="Total" value={money(sale.total_amount)} bold />
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

// 80 mm thermal receipt (72 mm printable), e.g. RETSOL RTP-81. Choose the receipt printer and Margins: None when printing.
function Receipt({ sale, company }) {
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
      </div>
      {hr}
      <R label={`Bill: ${sale.invoice_no}`} value={fmtDate(sale.sale_date)} />
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
          <div className="font-semibold">{it.name}</div>
          <R
            label={`${[it.color, it.lot_no].filter(Boolean).join(' / ')}${it.color || it.lot_no ? ' · ' : ''}${qty(it.qty)} ${it.unit} × ${money(it.rate)}`}
            value={money(it.amount)}
          />
        </div>
      ))}
      {hr}
      <R label="Subtotal" value={money(sale.subtotal)} />
      {Number(sale.discount_amount) > 0 && (
        <R
          label={`Offer${sale.discount_type === 'percent' ? ` (${Number(sale.discount_value)}%)` : ''}`}
          value={`- ${money(sale.discount_amount)}`}
        />
      )}
      <R label={`GST (${Number(sale.tax_percent)}%)`} value={money(sale.tax_amount)} />
      {hr}
      <R label="TOTAL" value={money(sale.total_amount)} bold />
      {hr}
      <div className="text-[8pt]">{rupeesInWords(sale.total_amount)}</div>
      {sale.notes && <div className="mt-1 text-[8pt]">Note: {sale.notes}</div>}
      <div className="mt-2 text-center">Thank you! Visit again.</div>
    </div>
  );
}
