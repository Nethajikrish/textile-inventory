import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext.jsx';
import { Badge, Button, ErrorBox, Field, Modal, Pagination, Select, Table, Tabs, Td, TextArea } from '../components/ui.jsx';
import ItemsEditor, { blankItem, itemsTotal } from '../components/ItemsEditor.jsx';
import { TotalLine } from '../components/PrintParts.jsx';
import { QuickCustomer } from './Sales.jsx';
import { errMsg, fmtDate, money, today } from '../utils/format';
import { computeBill, lineAmount, lineDiscount, quoteLine } from '../utils/bill';

const TABS = [{ key: 'customer', label: 'Customer quotations' }, { key: 'supplier', label: 'Supplier quotations' }];
const STATUSES = [{ id: 'open', name: 'Open' }, { id: 'converted', name: 'Converted' }, { id: 'cancelled', name: 'Cancelled' }];
const VALID_DAYS = 7;

const plusDays = (days) => {
  const d = new Date(Date.now() + days * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const isExpired = (q) => q.status === 'open' && q.valid_until && q.valid_until < today();

// Quotations never change stock. A supplier quotation becomes a purchase order; a customer quotation opens as a new bill.
export default function Quotations() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const type = params.get('type') === 'supplier' ? 'supplier' : 'customer';
  const isSupplier = type === 'supplier';
  const canWrite = !isSupplier || ['Admin', 'Manager'].includes(user.role);

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ search: '', status: '', from: '', to: '' });
  const [editing, setEditing] = useState(null); // 'new' or a quotation id
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const perPage = 10;

  const load = useCallback(() => {
    api
      .get('/quotations', { params: { type, page, per_page: perPage, ...filters } })
      .then((res) => {
        setItems(res.data.data.items);
        setTotal(res.data.data.total);
      })
      .catch(() => setError('Failed to load quotations'));
  }, [type, page, filters]);
  useEffect(load, [load]);

  const setFilter = (k) => (e) => { setPage(1); setFilters({ ...filters, [k]: e.target.value }); };
  const switchTab = (t) => { setPage(1); setNotice(''); setError(''); setParams({ type: t }); };

  const cancel = async (q) => {
    if (!window.confirm(`Cancel quotation ${q.quote_no}?`)) return;
    setError('');
    setNotice('');
    try {
      await api.post(`/quotations/${q.id}/cancel`);
      load();
    } catch (err) {
      setError(errMsg(err));
    }
  };

  const convert = async (q) => {
    const expired = isExpired(q) ? ` It expired on ${fmtDate(q.valid_until)}.` : '';
    if (isSupplier) {
      if (!window.confirm(`Create a purchase order from ${q.quote_no} at the quoted rates?${expired} Stock is added only when you receive the goods.`)) return;
      setError('');
      setNotice('');
      try {
        const res = await api.post(`/quotations/${q.id}/convert`);
        setNotice(`Purchase order ${res.data.data.purchase_no} created. Receive the goods under Purchases when they arrive.`);
        load();
      } catch (err) {
        setError(errMsg(err));
      }
      return;
    }
    if (expired && !window.confirm(`${q.quote_no} expired on ${fmtDate(q.valid_until)}. Make a bill at the quoted prices anyway?`)) return;
    navigate(`/sales?tab=new&quote=${q.id}`);
  };

  return (
    <div className="space-y-4">
      <Tabs tabs={TABS} value={type} onChange={switchTab} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <input value={filters.search} onChange={setFilter('search')} placeholder={`Search number or ${type}...`} className="w-64 rounded border border-slate-300 px-3 py-2 text-sm" />
          <Select value={filters.status} onChange={setFilter('status')} options={STATUSES} placeholder="All statuses" />
          <Field label="From" type="date" value={filters.from} onChange={setFilter('from')} />
          <Field label="To" type="date" value={filters.to} onChange={setFilter('to')} />
        </div>
        {canWrite && <Button onClick={() => setEditing('new')}>New quotation</Button>}
      </div>

      <ErrorBox>{error}</ErrorBox>
      {notice && <div className="rounded bg-green-50 px-3 py-2 text-sm text-green-800">{notice}</div>}

      <Table columns={[{ label: 'Quotation no.' }, { label: 'Date' }, { label: 'Valid until' }, { label: isSupplier ? 'Supplier' : 'Customer' }, { label: 'Status' }, { label: 'Amount', className: 'text-right' }, { label: '' }]} empty="No quotations found">
        {items.map((q) => (
          <tr key={q.id} className="border-t">
            <Td className="font-mono">{q.quote_no}</Td>
            <Td>{fmtDate(q.quote_date)}</Td>
            <Td>{fmtDate(q.valid_until)}</Td>
            <Td>{q.party}</Td>
            <Td><Badge tone={isExpired(q) ? 'expired' : undefined}>{isExpired(q) ? 'expired' : q.status}</Badge></Td>
            <Td className="text-right">{money(q.total_amount)}</Td>
            <Td className="space-x-3 whitespace-nowrap text-right">
              <Link to={`/quotations/${q.id}/print`} className="text-slate-600 hover:underline">View / Print</Link>
              {q.status === 'converted' && (
                <Link to={isSupplier ? `/purchases/${q.converted_id}/print` : `/sales/${q.converted_id}/print`} className="text-slate-600 hover:underline">{q.converted_no}</Link>
              )}
              {canWrite && q.status === 'open' && (
                <>
                  <button onClick={() => setEditing(q.id)} className="text-indigo-600 hover:underline">Edit</button>
                  <button onClick={() => cancel(q)} className="text-red-600 hover:underline">Cancel</button>
                  <button onClick={() => convert(q)} className="font-medium text-green-700 hover:underline">{isSupplier ? 'Make purchase order' : 'Make bill'}</button>
                </>
              )}
            </Td>
          </tr>
        ))}
      </Table>

      <Pagination page={page} perPage={perPage} total={total} onChange={setPage} noun="quotations" />

      {editing && (
        <QuotationForm
          type={type}
          id={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); setNotice(''); load(); }}
        />
      )}
    </div>
  );
}

function QuotationForm({ type, id, onClose, onSaved }) {
  const isSupplier = type === 'supplier';
  const [parties, setParties] = useState([]);
  const [products, setProducts] = useState([]);
  const [quoteNo, setQuoteNo] = useState('');
  const [form, setForm] = useState({
    supplier_id: '', customer_id: '', quote_date: today(), valid_until: plusDays(VALID_DAYS),
    discount_type: 'percent', discount_value: '', notes: '',
  });
  const [lines, setLines] = useState([blankItem()]);
  const [ready, setReady] = useState(!id);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [addingCustomer, setAddingCustomer] = useState(false);
  const formRef = useRef(null);

  useEffect(() => {
    api.get(isSupplier ? '/suppliers' : '/customers', { params: { all: 1 } }).then((r) => setParties(r.data.data));
    api.get('/products', { params: { all: 1 } }).then((r) => setProducts(r.data.data));
    if (!id) return;
    api.get(`/quotations/${id}`).then((r) => {
      const q = r.data.data;
      setQuoteNo(q.quote_no);
      setForm({
        supplier_id: q.supplier_id ? String(q.supplier_id) : '', customer_id: q.customer_id ? String(q.customer_id) : '',
        quote_date: q.quote_date, valid_until: q.valid_until || '',
        discount_type: q.discount_type, discount_value: Number(q.discount_value) ? String(Number(q.discount_value)) : '', notes: q.notes || '',
      });
      const saved = q.items.filter((it) => Number(it.is_active)).map(quoteLine);
      setLines(isSupplier && saved.length ? saved : [...saved, blankItem()]);
      setReady(true);
    }).catch(() => setError('Failed to load quotation'));
  }, [id, isSupplier]);

  const byId = Object.fromEntries(products.map((p) => [String(p.id), p]));
  const bill = computeBill(
    lines.filter((l) => byId[l.product_id]).map((l) => ({ amount: lineAmount(l), gst_percent: byId[l.product_id].gst_percent })),
    form.discount_type,
    form.discount_value,
  );
  const lineError = !isSupplier && lines.some((l) => lineDiscount(l) < 0 || lineAmount(l) < 0) ? 'An item discount cannot be negative or exceed the line amount' : '';
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  // Ctrl+Enter or Ctrl+S saves, as on the New Invoice screen.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'Enter' || e.key.toLowerCase() === 's')) {
        e.preventDefault();
        if (!saving) formRef.current?.requestSubmit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const save = async (e) => {
    e.preventDefault();
    if (lineError) return setError(lineError);
    setError('');
    setSaving(true);
    try {
      const body = { ...form, type, items: lines.filter((l) => l.product_id) };
      if (id) await api.put(`/quotations/${id}`, body);
      else await api.post('/quotations', body);
      onSaved();
    } catch (err) {
      setError(errMsg(err, 'Save failed'));
      setSaving(false);
    }
  };

  const title = `${id ? `Edit ${quoteNo}` : 'New'} ${isSupplier ? 'supplier' : 'customer'} quotation`;

  return (
    <Modal title={title} onClose={onClose} wide>
      {!ready ? <ErrorBox>{error}</ErrorBox> : (
        <form ref={formRef} onSubmit={save} className="space-y-4">
          <ErrorBox>{error}</ErrorBox>
          <div className="grid gap-3 sm:grid-cols-3">
            {isSupplier ? (
              <Select label="Supplier *" value={form.supplier_id} onChange={set('supplier_id')} options={parties} placeholder="Select supplier" required />
            ) : (
              <div>
                <Select
                  label="Customer"
                  value={form.customer_id}
                  onChange={set('customer_id')}
                  options={parties}
                  getLabel={(c) => (c.phone ? `${c.name} · ${c.phone}` : c.name)}
                  placeholder="Walk-in customer (no customer)"
                />
                {!addingCustomer && (
                  <button type="button" onClick={() => setAddingCustomer(true)} className="mt-1 text-xs text-indigo-600 hover:underline">+ New customer</button>
                )}
              </div>
            )}
            <Field label="Quotation date *" type="date" value={form.quote_date} onChange={set('quote_date')} required />
            <Field label="Valid until" type="date" min={form.quote_date} value={form.valid_until} onChange={set('valid_until')} />
          </div>
          {addingCustomer && (
            <QuickCustomer
              onCancel={() => setAddingCustomer(false)}
              onCreated={(c) => {
                setParties((list) => [...list, c].sort((a, b) => a.name.localeCompare(b.name)));
                setForm((f) => ({ ...f, customer_id: String(c.id) }));
                setAddingCustomer(false);
              }}
            />
          )}
          {isSupplier ? (
            <ItemsEditor products={products} items={lines} onChange={setLines} priceField="purchase_price" />
          ) : (
            <ItemsEditor products={products} items={lines} onChange={setLines} priceField="selling_price" checkStock showPricing autoNext />
          )}
          {!isSupplier && (
            <div className="flex flex-wrap items-end gap-3">
              <label className="block text-xs text-slate-600">
                Discount on whole quotation
                <select value={form.discount_type} onChange={set('discount_type')} className="mt-1 block rounded border border-slate-300 px-1 py-1.5 text-sm">
                  <option value="percent">%</option>
                  <option value="amount">₹</option>
                </select>
              </label>
              <Field label=" " type="number" min="0" max={form.discount_type === 'percent' ? '100' : undefined} step="0.01" value={form.discount_value} onChange={set('discount_value')} placeholder="0" />
            </div>
          )}
          <TextArea label="Notes" value={form.notes} onChange={set('notes')} />
          <div className="ml-auto w-72 space-y-1 border-t pt-3 text-sm">
            {isSupplier ? (
              <TotalLine label="Total" value={money(itemsTotal(lines))} bold />
            ) : (
              <>
                <TotalLine label="Subtotal (incl. GST)" value={money(bill.subtotal)} />
                {bill.discount > 0 && <TotalLine label="Discount" value={`- ${money(bill.discount)}`} />}
                {bill.roundOff !== 0 && <TotalLine label="Round off" value={`${bill.roundOff > 0 ? '+' : '-'} ${money(Math.abs(bill.roundOff))}`} />}
                <TotalLine label="Quoted amount" value={money(bill.total)} bold />
              </>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>Close</Button>
            <Button disabled={saving}>{saving ? 'Saving...' : 'Save quotation'}</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
