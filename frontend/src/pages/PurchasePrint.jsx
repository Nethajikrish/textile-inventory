import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../services/api';
import { useCompany } from '../context/CompanyContext.jsx';
import { CompanyBlock, PartyBlock, Stamp, TotalLine } from '../components/PrintParts.jsx';
import { fmtDate, money, qty, rupeesInWords } from '../utils/format';

// Printable purchase order / purchase bill. "Print / Save as PDF" uses the browser's print dialog.
export default function PurchasePrint() {
  const { id } = useParams();
  const company = useCompany();
  const [p, setP] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/purchases/${id}`).then((r) => setP(r.data.data)).catch(() => setError('Purchase not found'));
  }, [id]);

  useEffect(() => {
    if (p) document.title = `Purchase ${p.purchase_no}`;
    return () => { document.title = company.company_name; };
  }, [p, company.company_name]);

  if (error) return <div className="p-8 text-red-600">{error}</div>;
  if (!p) return <div className="p-8 text-slate-500">Loading...</div>;

  const heading = p.status === 'ordered' ? 'Purchase Order' : 'Purchase Bill';

  return (
    <div className="min-h-screen bg-slate-100 py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-3xl justify-between px-4 print:hidden">
        <Link to="/purchases" className="text-sm text-indigo-600 hover:underline">← Back to purchases</Link>
        <button onClick={() => window.print()} className="rounded bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700">
          Print / Save as PDF
        </button>
      </div>

      <div className="relative mx-auto max-w-3xl bg-white p-8 text-sm text-slate-800 shadow print:max-w-none print:p-0 print:shadow-none">
        {p.status === 'cancelled' && <Stamp>Cancelled</Stamp>}

        <div className="flex justify-between border-b pb-4">
          <CompanyBlock />
          <div className="text-right">
            <div className="text-2xl font-semibold uppercase tracking-wide text-slate-700">{heading}</div>
            <div className="mt-1">No: <span className="font-mono font-medium">{p.purchase_no}</span></div>
            <div>Date: {fmtDate(p.purchase_date)}</div>
            <div className="capitalize">Status: {p.status}</div>
            {p.received_at && <div>Received: {fmtDate(p.received_at)}</div>}
          </div>
        </div>

        <PartyBlock title="Supplier" name={p.supplier} address={p.supplier_address} phone={p.supplier_phone} gstin={p.supplier_gstin} />

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
            {p.items.map((it, i) => (
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
            <div className="font-medium text-slate-800">{rupeesInWords(p.total_amount)}</div>
            {p.notes && <div className="mt-3">Notes: {p.notes}</div>}
          </div>
          <div className="w-64 shrink-0 space-y-1">
            <TotalLine label="Total" value={money(p.total_amount)} bold />
          </div>
        </div>

        <div className="mt-16 flex justify-between text-xs text-slate-500">
          <span>{p.created_by_name && `Prepared by ${p.created_by_name}`}</span>
          <span className="border-t border-slate-400 pt-1">Authorised signatory, {company.company_name}</span>
        </div>
      </div>
    </div>
  );
}
