import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext.jsx';
import { Badge, Button, ErrorBox, Field, Pagination, Select, Table, Tabs, Td, TextArea } from '../components/ui.jsx';
import ItemsEditor, { blankItem, itemsTotal } from '../components/ItemsEditor.jsx';
import { errMsg, fmtDate, money, today } from '../utils/format';

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
          <input value={filters.search} onChange={setFilter('search')} placeholder="Search invoice no. or customer..." className="w-64 rounded border border-slate-300 px-3 py-2 text-sm" />
          <Select value={filters.status} onChange={setFilter('status')} options={STATUSES} placeholder="All statuses" />
          <Field label="From" type="date" value={filters.from} onChange={setFilter('from')} />
          <Field label="To" type="date" value={filters.to} onChange={setFilter('to')} />
        </div>
      </div>

      <ErrorBox>{error}</ErrorBox>

      <Table columns={[{ label: 'Invoice no.' }, { label: 'Date' }, { label: 'Customer' }, { label: 'Status' }, { label: 'Amount', className: 'text-right' }, { label: '' }]} empty="No invoices found">
        {items.map((s) => (
          <tr key={s.id} className="border-t">
            <Td className="font-mono">{s.invoice_no}</Td>
            <Td>{fmtDate(s.sale_date)}</Td>
            <Td>{s.customer}</Td>
            <Td><Badge>{s.status}</Badge></Td>
            <Td className="text-right">{money(s.total_amount)}</Td>
            <Td className="space-x-3 whitespace-nowrap text-right">
              <Link to={`/sales/${s.id}/print`} className="text-indigo-600 hover:underline">View / Print</Link>
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

function NewInvoice({ onCancel }) {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState({ customer_id: '', sale_date: today(), tax_percent: '5', discount_type: 'percent', discount_value: '', notes: '' });
  const [lines, setLines] = useState([blankItem()]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [addingCustomer, setAddingCustomer] = useState(false);

  useEffect(() => {
    api.get('/customers', { params: { all: 1 } }).then((r) => setCustomers(r.data.data));
    api.get('/products', { params: { all: 1 } }).then((r) => setProducts(r.data.data));
  }, []);

  const subtotal = itemsTotal(lines);
  const offerValue = Number(form.discount_value) || 0;
  const isPercent = form.discount_type === 'percent';
  const discount = Math.round((isPercent ? subtotal * offerValue / 100 : offerValue) * 100) / 100;
  const taxable = subtotal - discount;
  const tax = Math.round(taxable * (Number(form.tax_percent) || 0)) / 100;
  const offerError = offerValue < 0 ? 'Offer cannot be negative'
    : isPercent && offerValue > 100 ? 'Offer % must be between 0 and 100'
    : discount > subtotal ? 'Offer cannot exceed the subtotal' : '';
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    if (offerError) return setError(offerError);
    setError('');
    setSaving(true);
    try {
      const res = await api.post('/sales', { ...form, items: lines });
      navigate(`/sales/${res.data.data.id}/print`);
    } catch (err) {
      setError(errMsg(err, 'Save failed'));
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg bg-white p-6 shadow">
      <form onSubmit={save} className="space-y-4">
        <ErrorBox>{error}</ErrorBox>
        <div className="grid gap-3 sm:grid-cols-4">
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
          <Field label="Date *" type="date" value={form.sale_date} onChange={set('sale_date')} required />
          <Field label="GST %" type="number" min="0" max="100" value={form.tax_percent} onChange={set('tax_percent')} />
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
        <ItemsEditor products={products} items={lines} onChange={setLines} priceField="selling_price" checkStock />
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <span className="block text-xs text-slate-600">Offer type</span>
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
            label={isPercent ? 'Offer %' : 'Offer amount (₹)'}
            type="number"
            min="0"
            max={isPercent ? '100' : undefined}
            step="0.01"
            value={form.discount_value}
            onChange={set('discount_value')}
            placeholder="0"
          />
          {offerError && <span className="pb-2 text-sm text-red-600">{offerError}</span>}
        </div>
        <TextArea label="Notes" value={form.notes} onChange={set('notes')} />
        <div className="ml-auto w-72 space-y-1 border-t pt-3 text-sm">
          <Row label="Subtotal" value={money(subtotal)} />
          {discount > 0 && (
            <>
              <Row label={`Offer${isPercent ? ` (${offerValue}%)` : ''}`} value={`- ${money(discount)}`} />
              <Row label="Taxable value" value={money(taxable)} />
            </>
          )}
          <Row label={`GST (${Number(form.tax_percent) || 0}%)`} value={money(tax)} />
          <Row label="Total" value={money(taxable + tax)} bold />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button disabled={saving}>{saving ? 'Saving...' : 'Save invoice'}</Button>
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
