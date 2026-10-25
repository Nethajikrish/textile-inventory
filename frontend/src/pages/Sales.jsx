import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext.jsx';
import { Badge, Button, ErrorBox, Field, Pagination, Select, Table, Tabs, Td, TextArea } from '../components/ui.jsx';
import ItemsEditor, { blankItem } from '../components/ItemsEditor.jsx';
import { errMsg, fmtDate, fmtTime, money, today } from '../utils/format';
import { computeBill } from '../utils/bill';

const STATUSES = [{ id: 'completed', name: 'Completed' }, { id: 'cancelled', name: 'Cancelled' }];
const TABS = [{ key: 'new', label: 'New Invoice' }, { key: 'list', label: 'Sales List' }];

export default function Sales() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'list' ? 'list' : 'new';

  return (
    <div className="space-y-4">
      <Tabs tabs={TABS} value={tab} onChange={(t) => setParams({ tab: t })} />
      {tab === 'new' ? <NewInvoice onCancel={() => setParams({ tab: 'list' })} /> : <SalesList />}
    </div>
  );
}

function SalesList() {
  const { user } = useAuth();
  const canCancel = ['Admin', 'Manager'].includes(user.role);

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ search: '', status: '', from: '', to: '' });
  const [error, setError] = useState('');
  const perPage = 10;

  const load = useCallback(() => {
    api
      .get('/sales', { params: { page, per_page: perPage, ...filters } })
      .then((res) => {
        setItems(res.data.data.items);
        setTotal(res.data.data.total);
      })
      .catch(() => setError('Failed to load invoices'));
  }, [page, filters]);
  useEffect(load, [load]);

  const setFilter = (k) => (e) => { setPage(1); setFilters({ ...filters, [k]: e.target.value }); };

  const cancel = async (s) => {
    if (!window.confirm(`Cancel invoice ${s.invoice_no}? The stock will be added back.`)) return;
    setError('');
    try {
      await api.post(`/sales/${s.id}/cancel`);
      load();
    } catch (err) {
      setError(errMsg(err));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <input value={filters.search} onChange={setFilter('search')} placeholder="Search bill no. or customer..." className="w-64 rounded border border-slate-300 px-3 py-2 text-sm" />
          <Select value={filters.status} onChange={setFilter('status')} options={STATUSES} placeholder="All statuses" />
          <Field label="From" type="date" value={filters.from} onChange={setFilter('from')} />
          <Field label="To" type="date" value={filters.to} onChange={setFilter('to')} />
        </div>
      </div>

      <ErrorBox>{error}</ErrorBox>

      <Table columns={[{ label: 'Bill no.' }, { label: 'Date & time' }, { label: 'Counter' }, { label: 'Customer' }, { label: 'Status' }, { label: 'Amount', className: 'text-right' }, { label: '' }]} empty="No invoices found">
        {items.map((s) => (
          <tr key={s.id} className="border-t">
            <Td className="font-mono">{s.invoice_no}</Td>
            <Td className="whitespace-nowrap">{fmtDate(s.sale_date)} {fmtTime(s.sale_time)}</Td>
            <Td>{s.counter}</Td>
            <Td>{s.customer}</Td>
            <Td><Badge>{s.status}</Badge></Td>
            <Td className="text-right">{money(s.total_amount)}</Td>
            <Td className="space-x-3 whitespace-nowrap text-right">
              <Link to={`/sales/${s.id}/print`} className="text-indigo-600 hover:underline">View / Print</Link>
              <Link to={`/sales/${s.id}/print?copy=duplicate`} className="text-slate-600 hover:underline">Duplicate bill</Link>
              {canCancel && s.status === 'completed' && (
                <button onClick={() => cancel(s)} className="text-red-600 hover:underline">Cancel</button>
              )}
            </Td>
          </tr>
        ))}
      </Table>

      <Pagination page={page} perPage={perPage} total={total} onChange={setPage} noun="invoices" />
    </div>
  );
}

const nowTime = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const savedCounter = () => {
  try { return localStorage.getItem('counterId') || ''; } catch { return ''; }
};

function NewInvoice({ onCancel }) {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [counters, setCounters] = useState([]);
  const [billNo, setBillNo] = useState('');
  const [form, setForm] = useState({
    customer_id: '', counter_id: savedCounter(), sale_date: today(), sale_time: nowTime(),
    discount_type: 'percent', discount_value: '', notes: '',
  });
  const [lines, setLines] = useState([blankItem()]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [addingCustomer, setAddingCustomer] = useState(false);
  const formRef = useRef(null);

  useEffect(() => {
    api.get('/customers', { params: { all: 1 } }).then((r) => setCustomers(r.data.data));
    api.get('/products', { params: { all: 1 } }).then((r) => setProducts(r.data.data));
    api.get('/sales/next-number').then((r) => setBillNo(r.data.data.invoice_no)).catch(() => {});
    api.get('/counters').then((r) => {
      const list = r.data.data;
      setCounters(list);
      // Keep the counter this computer used last; otherwise the first one.
      setForm((f) => (list.some((c) => String(c.id) === f.counter_id) ? f : { ...f, counter_id: list[0] ? String(list[0].id) : '' }));
    });
  }, []);

  const byId = Object.fromEntries(products.map((p) => [String(p.id), p]));
  const billLines = lines
    .filter((l) => byId[l.product_id])
    .map((l) => ({ amount: (Number(l.qty) || 0) * (Number(l.rate) || 0), gst_percent: byId[l.product_id].gst_percent }));
  const bill = computeBill(billLines, form.discount_type, form.discount_value);
  const mrpTotal = lines.reduce((sum, l) => sum + (Number(l.qty) || 0) * Math.max(Number(byId[l.product_id]?.mrp) || 0, Number(l.rate) || 0), 0);
  const saved = mrpTotal - bill.total;

  const discValue = Number(form.discount_value) || 0;
  const isPercent = form.discount_type === 'percent';
  const discountError = discValue < 0 ? 'Discount cannot be negative'
    : isPercent && discValue > 100 ? 'Discount % must be between 0 and 100'
    : bill.discount > bill.subtotal ? 'Discount cannot exceed the subtotal' : '';
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  // Ctrl+Enter or Ctrl+S saves the bill from anywhere on the page.
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
    if (discountError) return setError(discountError);
    setError('');
    setSaving(true);
    try {
      try { localStorage.setItem('counterId', form.counter_id); } catch { /* ignore */ }
      const res = await api.post('/sales', { ...form, items: lines });
      navigate(`/sales/${res.data.data.id}/print`);
    } catch (err) {
      setError(errMsg(err, 'Save failed'));
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg bg-white p-6 shadow">
      <form ref={formRef} onSubmit={save} className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="text-sm text-slate-500">
            Bill No.{' '}
            <span className="font-mono text-lg font-semibold text-slate-800">{billNo || '…'}</span>
            <span className="ml-2 text-xs">(auto-generated; confirmed when saved)</span>
          </div>
        </div>
        <ErrorBox>{error}</ErrorBox>
        <div className="grid gap-3 sm:grid-cols-5">
          <div className="sm:col-span-2">
            <Select
              label="Customer"
              value={form.customer_id}
              onChange={set('customer_id')}
              options={customers}
              getLabel={(c) => (c.phone ? `${c.name} · ${c.phone}` : c.name)}
              placeholder="Walk-in customer (no customer)"
            />
            {!addingCustomer && (
              <button type="button" onClick={() => setAddingCustomer(true)} className="mt-1 text-xs text-indigo-600 hover:underline">
                + New customer
              </button>
            )}
          </div>
          <Select label="Counter" value={form.counter_id} onChange={set('counter_id')} options={counters} placeholder="No counter" />
          <Field label="Bill date *" type="date" value={form.sale_date} onChange={set('sale_date')} required />
          <Field label="Bill time *" type="time" value={form.sale_time} onChange={set('sale_time')} required />
        </div>
        {addingCustomer && (
          <QuickCustomer
            onCancel={() => setAddingCustomer(false)}
            onCreated={(c) => {
              setCustomers((list) => [...list, c].sort((a, b) => a.name.localeCompare(b.name)));
              setForm((f) => ({ ...f, customer_id: String(c.id) }));
              setAddingCustomer(false);
            }}
          />
        )}
        <ItemsEditor products={products} items={lines} onChange={setLines} priceField="selling_price" checkStock showPricing />
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <span className="block text-xs text-slate-600">Discount type</span>
            <div className="mt-1 inline-flex overflow-hidden rounded border border-slate-300 text-sm">
              {[['percent', '% Percentage'], ['amount', '₹ Amount']].map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setForm({ ...form, discount_type: k })}
                  className={`px-3 py-1.5 ${form.discount_type === k ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <Field
            label={isPercent ? 'Discount %' : 'Discount amount (₹)'}
            type="number"
            min="0"
            max={isPercent ? '100' : undefined}
            step="0.01"
            value={form.discount_value}
            onChange={set('discount_value')}
            placeholder="0"
          />
          {discountError && <span className="pb-2 text-sm text-red-600">{discountError}</span>}
        </div>
        <TextArea label="Notes" value={form.notes} onChange={set('notes')} />
        <div className="ml-auto w-80 space-y-1 border-t pt-3 text-sm">
          <Row label="Subtotal (incl. GST)" value={money(bill.subtotal)} />
          {bill.discount > 0 && <Row label={`Discount${isPercent ? ` (${discValue}%)` : ''}`} value={`- ${money(bill.discount)}`} />}
          <div className="space-y-0.5 py-1 text-xs text-slate-500">
            <Row label="Taxable value" value={money(bill.taxable)} />
            <Row label="CGST" value={money(bill.cgst)} />
            <Row label="SGST" value={money(bill.sgst)} />
          </div>
          {bill.roundOff !== 0 && <Row label="Round off" value={`${bill.roundOff > 0 ? '+' : '-'} ${money(Math.abs(bill.roundOff))}`} />}
          <Row label="Net amount" value={money(bill.total)} bold />
          {saved > 0.5 && <div className="text-right text-xs font-medium text-green-700">Customer saves {money(saved)} on MRP</div>}
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button disabled={saving}>{saving ? 'Saving...' : 'Save bill'}</Button>
        </div>
      </form>
    </div>
  );
}

// Minimal customer (name + phone) created without leaving the invoice.
// Not a nested <form>, so Enter is handled here instead of submitting the invoice.
function QuickCustomer({ onCancel, onCreated }) {
  const [c, setC] = useState({ name: '', phone: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!c.name.trim()) return setError('Name is required');
    setError('');
    setSaving(true);
    try {
      const res = await api.post('/customers', c);
      onCreated({ id: res.data.data.id, name: c.name.trim(), phone: c.phone.trim() || null });
    } catch (err) {
      setError(errMsg(err, 'Could not add customer'));
      setSaving(false);
    }
  };
  const onKeyDown = (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } };

  return (
    <div className="space-y-2 rounded border border-indigo-100 bg-indigo-50/50 p-3">
      <div className="text-sm font-medium text-slate-700">New customer</div>
      <ErrorBox>{error}</ErrorBox>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Name *" value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} onKeyDown={onKeyDown} autoFocus className="w-64" />
        <Field label="Phone" type="tel" value={c.phone} onChange={(e) => setC({ ...c, phone: e.target.value })} onKeyDown={onKeyDown} className="w-48" />
        <Button type="button" onClick={save} disabled={saving}>{saving ? 'Adding...' : 'Add & select'}</Button>
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>
      <p className="text-xs text-slate-500">
        Email, GSTIN and address can be added later under <Link to="/customers" className="text-indigo-600 hover:underline">Customers</Link>.
      </p>
    </div>
  );
}

function Row({ label, value, bold }) {
  return (
    <div className={`flex justify-between ${bold ? 'text-base font-semibold' : ''}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
