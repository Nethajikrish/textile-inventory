import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../services/api';
import { useCompany } from '../context/CompanyContext.jsx';
import { CompanyBlock, PartyBlock, Stamp, TotalLine } from '../components/PrintParts.jsx';
import { GstTable } from './InvoicePrint.jsx';
import { gstSummary } from '../utils/bill';
import { fmtDate, money, qty, rupeesInWords } from '../utils/format';

// Printable quotation. "Print / Save as PDF" uses the browser's print dialog.
export default function QuotationPrint() {
  const { id } = useParams();
  const company = useCompany();
  const [q, setQ] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/quotations/${id}`).then((r) => setQ(r.data.data)).catch(() => setError('Quotation not found'));
  }, [id]);

  useEffect(() => {
    if (q) document.title = `Quotation ${q.quote_no}`;
    return () => { document.title = company.company_name; };
  }, [q, company.company_name]);

  if (error) return <div className="p-8 text-red-600">{error}</div>;
  if (!q) return <div className="p-8 text-slate-500">Loading...</div>;

  const isCustomer = q.type === 'customer';
  const lineDiscounts = q.items.some((it) => Number(it.discount_amount) > 0);
  const discount = Number(q.discount_amount);
  const roundOff = Number(q.round_off);

  return (
    <div className="min-h-screen bg-slate-100 py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-3xl justify-between px-4 print:hidden">
        <Link to={`/quotations?type=${q.type}`} className="text-sm text-indigo-600 hover:underline">← Back to quotations</Link>
        <button onClick={() => window.print()} className="rounded bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700">
          Print / Save as PDF
        </button>
      </div>

      <div className="relative mx-auto max-w-3xl bg-white p-8 text-sm text-slate-800 shadow print:max-w-none print:p-0 print:shadow-none">
        {q.status === 'cancelled' && <Stamp>Cancelled</Stamp>}

        <div className="flex justify-between border-b pb-4">
          <CompanyBlock />
          <div className="text-right">
            <div className="text-2xl font-semibold uppercase tracking-wide text-slate-700">{isCustomer ? 'Quotation' : 'Supplier Quotation'}</div>
            <div className="mt-1">No: <span className="font-mono font-medium">{q.quote_no}</span></div>
            <div>Date: {fmtDate(q.quote_date)}</div>
            {q.valid_until && <div>Valid until: {fmtDate(q.valid_until)}</div>}
            {q.converted_no && <div>Converted to: {q.converted_no}</div>}
          </div>
        </div>

        <PartyBlock title={isCustomer ? 'Quotation for' : 'Supplier'} name={q.party} address={q.party_address} phone={q.party_phone} gstin={q.party_gstin} />

        <table className="mt-4 w-full">
          <thead>
            <tr className="border-b-2 border-slate-300 text-left text-xs uppercase text-slate-500">
              <th className="py-2">#</th>
              <th className="py-2">Description</th>
              <th className="py-2 text-right">Qty</th>
              <th className="py-2 text-right">{isCustomer ? 'Price' : 'Rate'}</th>
              {lineDiscounts && <th className="py-2 text-right">Disc</th>}
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {q.items.map((it, i) => (
              <tr key={it.id} className="border-b border-slate-200">
                <td className="py-2 align-top">{i + 1}</td>
                <td className="py-2">
                  <div>{it.name}</div>
                  <div className="text-xs text-slate-500">
                    {[it.sku, it.brand, it.color, it.size && `Size ${it.size}`, isCustomer && `GST ${Number(it.gst_percent)}%`].filter(Boolean).join(' · ')}
                  </div>
                </td>
                <td className="py-2 text-right align-top">{qty(it.qty)} {it.unit}</td>
                <td className="py-2 text-right align-top">{money(it.rate)}</td>
                {lineDiscounts && <td className="py-2 text-right align-top">{Number(it.discount_amount) > 0 ? (it.discount_type === 'percent' ? `${Number(it.discount_value)}%` : money(it.discount_amount)) : ''}</td>}
                <td className="py-2 text-right align-top">{money(it.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 flex justify-between gap-6">
          <div className="space-y-3 text-slate-600">
            {isCustomer && (
              <>
                <GstTable rows={gstSummary(q.items)} />
                <div className="text-xs">Prices are inclusive of GST.</div>
              </>
            )}
            <div>
              <div className="text-xs uppercase text-slate-500">Amount in words</div>
              <div className="font-medium text-slate-800">{rupeesInWords(q.total_amount)}</div>
            </div>
            {q.notes && <div>Notes: {q.notes}</div>}
          </div>
          <div className="w-64 shrink-0 space-y-1">
            {isCustomer && <TotalLine label="Subtotal" value={money(q.subtotal)} />}
            {discount > 0 && <TotalLine label={`Discount${q.discount_type === 'percent' ? ` (${Number(q.discount_value)}%)` : ''}`} value={`- ${money(discount)}`} />}
            {roundOff !== 0 && <TotalLine label="Round off" value={`${roundOff > 0 ? '+' : '-'} ${money(Math.abs(roundOff))}`} />}
            <TotalLine label={isCustomer ? 'Quoted amount' : 'Total'} value={money(q.total_amount)} bold />
          </div>
        </div>

        {isCustomer && (
          <div className="mt-6 text-xs text-slate-600">
            This is a quotation, not a tax invoice.{q.valid_until && ` Prices are valid until ${fmtDate(q.valid_until)}.`} Items are subject to availability.
          </div>
        )}

        <div className="mt-16 flex justify-between text-xs text-slate-500">
          <span>{q.created_by_name && `Prepared by ${q.created_by_name}`}</span>
          <span className="border-t border-slate-400 pt-1">Authorised signatory, {company.company_name}</span>
        </div>
      </div>
    </div>
  );
}
