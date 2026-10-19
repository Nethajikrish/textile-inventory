import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext.jsx';
import { Badge, Button, ErrorBox, Field, Pagination, Select, Table, Tabs, Td, TextArea } from '../components/ui.jsx';
import { errMsg, fmtDate, money, productLabel, qty } from '../utils/format';

const TXN_TYPES = ['opening', 'purchase', 'sale', 'adjustment', 'return', 'damage'].map((t) => ({ id: t, name: t[0].toUpperCase() + t.slice(1) }));

export default function Stock() {
  const { user } = useAuth();
  const canWrite = ['Admin', 'Manager'].includes(user.role);
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'summary';

  const tabs = [
    { key: 'summary', label: 'Current stock' },
    { key: 'ledger', label: 'Stock ledger' },
    ...(canWrite ? [{ key: 'adjust', label: 'Adjust stock' }] : []),
    { key: 'alerts', label: 'Low-stock alerts' },
  ];

  return (
    <div className="space-y-4">
      <Tabs tabs={tabs} value={tab} onChange={(t) => setParams({ tab: t })} />
      {tab === 'summary' && <Summary />}
      {tab === 'ledger' && <Ledger initialProduct={params.get('product') || ''} />}
      {tab === 'adjust' && canWrite && <Adjust onDone={(productId) => setParams({ tab: 'ledger', product: productId })} />}
      {tab === 'alerts' && <Alerts />}
    </div>
  );
}

function Summary() {
  const [group, setGroup] = useState('product');
  const [categoryId, setCategoryId] = useState('');
  const [categories, setCategories] = useState([]);
  const [rows, setRows] = useState([]);

  useEffect(() => { api.get('/categories').then((r) => setCategories(r.data.data)); }, []);
  useEffect(() => {
    api.get('/stock/summary', { params: { group, category_id: categoryId } }).then((r) => setRows(r.data.data));
  }, [group, categoryId]);

  const totalValue = rows.reduce((s, r) => s + Number(r.value), 0);
  const groupLabel = { product: 'Product', color: 'Color', lot: 'Lot / design' }[group];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <Select
          label="Group by"
          value={group}
          onChange={(e) => setGroup(e.target.value || 'product')}
          options={[{ id: 'product', name: 'Product' }, { id: 'color', name: 'Color' }, { id: 'lot', name: 'Lot / design no.' }]}
          placeholder="Product"
        />
        <Select label="Category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} options={categories} placeholder="All categories" />
        <div className="ml-auto text-sm text-slate-600">Total stock value: <span className="font-semibold text-slate-800">{money(totalValue)}</span></div>
      </div>
      <Table columns={[{ label: groupLabel }, { label: 'Products', className: 'text-right' }, { label: 'Quantity', className: 'text-right' }, { label: 'Value (at cost)', className: 'text-right' }, { label: '' }]} empty="No stock">
        {rows.map((r) => (
          <tr key={`${r.label}|${r.unit}`} className="border-t">
            <Td className="font-medium">{r.label}</Td>
            <Td className="text-right">{r.products}</Td>
            <Td className="text-right">{qty(r.qty)} {r.unit}</Td>
            <Td className="text-right">{money(r.value)}</Td>
            <Td>{Number(r.low_items) > 0 && <Badge tone="low">{r.low_items} low</Badge>}</Td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

function Ledger({ initialProduct }) {
  const [products, setProducts] = useState([]);
  const [filters, setFilters] = useState({ product_id: initialProduct, type: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0 });
  const perPage = 20;

  useEffect(() => { api.get('/products', { params: { all: 1 } }).then((r) => setProducts(r.data.data)); }, []);
  useEffect(() => {
    api.get('/stock/ledger', { params: { ...filters, page, per_page: perPage } }).then((r) => setData(r.data.data));
  }, [filters, page]);

  const setFilter = (k) => (e) => { setPage(1); setFilters({ ...filters, [k]: e.target.value }); };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <Select label="Product" value={filters.product_id} onChange={setFilter('product_id')} options={products} getLabel={productLabel} placeholder="All products" className="w-80" />
        <Select label="Type" value={filters.type} onChange={setFilter('type')} options={TXN_TYPES} placeholder="All types" />
        <Field label="From" type="date" value={filters.from} onChange={setFilter('from')} />
        <Field label="To" type="date" value={filters.to} onChange={setFilter('to')} />
      </div>
      <Table columns={[{ label: 'Date' }, { label: 'Product' }, { label: 'Type' }, { label: 'In', className: 'text-right' }, { label: 'Out', className: 'text-right' }, { label: 'Balance', className: 'text-right' }, { label: 'Remarks' }, { label: 'By' }]} empty="No stock movements">
        {data.items.map((l) => (
          <tr key={l.id} className="border-t">
            <Td className="whitespace-nowrap">{fmtDate(l.created_at)}</Td>
            <Td>
              <div>{l.sku} — {l.name}</div>
              <div className="text-xs text-slate-500">{[l.color, l.lot_no].filter(Boolean).join(' / ')}</div>
            </Td>
            <Td><Badge tone={l.txn_type === 'damage' ? 'low' : undefined}>{l.txn_type}</Badge></Td>
            <Td className="text-right text-green-700">{Number(l.qty_in) ? `+${qty(l.qty_in)}` : ''}</Td>
            <Td className="text-right text-red-700">{Number(l.qty_out) ? `−${qty(l.qty_out)}` : ''}</Td>
            <Td className="text-right font-medium">{qty(l.balance)} {l.unit}</Td>
            <Td className="text-slate-600">{l.remarks}</Td>
            <Td className="text-slate-600">{l.user}</Td>
          </tr>
        ))}
      </Table>
      <Pagination page={page} perPage={perPage} total={data.total} onChange={setPage} noun="entries" />
    </div>
  );
}

function Adjust({ onDone }) {
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState({ product_id: '', type: 'damage', direction: 'out', qty: '', remarks: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { api.get('/products', { params: { all: 1 } }).then((r) => setProducts(r.data.data)); }, []);

  const product = products.find((p) => String(p.id) === form.product_id);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await api.post('/stock/adjust', form);
      onDone(form.product_id);
    } catch (err) {
      setError(errMsg(err, 'Adjustment failed'));
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="max-w-xl space-y-4 rounded-lg bg-white p-6 shadow">
      <ErrorBox>{error}</ErrorBox>
      <Select label="Product *" value={form.product_id} onChange={set('product_id')} options={products} getLabel={productLabel} required />
      {product && <p className="text-sm text-slate-600">Current stock: {qty(product.stock_qty)} {product.unit}</p>}
      <div className="grid gap-3 sm:grid-cols-3">
        <Select
          label="Type *"
          value={form.type}
          onChange={set('type')}
          options={[{ id: 'damage', name: 'Damage (remove)' }, { id: 'return', name: 'Customer return (add)' }, { id: 'adjustment', name: 'Correction' }]}
          required
        />
        {form.type === 'adjustment' && (
          <Select label="Direction *" value={form.direction} onChange={set('direction')} options={[{ id: 'in', name: 'Add stock' }, { id: 'out', name: 'Remove stock' }]} required />
        )}
        <Field label="Quantity *" type="number" min="0.001" value={form.qty} onChange={set('qty')} required />
      </div>
      <TextArea label={form.type === 'adjustment' ? 'Reason *' : 'Remarks'} value={form.remarks} onChange={set('remarks')} required={form.type === 'adjustment'} maxLength={255} />
      <div className="flex justify-end">
        <Button disabled={saving}>{saving ? 'Saving...' : 'Save adjustment'}</Button>
      </div>
    </form>
  );
}

function Alerts() {
  const [rows, setRows] = useState(null);
  const load = useCallback(() => { api.get('/stock/alerts').then((r) => setRows(r.data.data)); }, []);
  useEffect(load, [load]);

  if (!rows) return <div className="text-slate-500">Loading...</div>;
  return (
    <Table columns={[{ label: 'SKU' }, { label: 'Product' }, { label: 'Color / Lot' }, { label: 'In stock', className: 'text-right' }, { label: 'Minimum', className: 'text-right' }, { label: 'Shortfall', className: 'text-right' }]} empty="All products are above their minimum stock level.">
      {rows.map((p) => (
        <tr key={p.id} className="border-t">
          <Td className="font-mono">{p.sku}</Td>
          <Td>{p.name}</Td>
          <Td>{[p.color, p.lot_no].filter(Boolean).join(' / ')}</Td>
          <Td className="text-right font-semibold text-red-600">{qty(p.stock_qty)} {p.unit}</Td>
          <Td className="text-right">{qty(p.min_stock)} {p.unit}</Td>
          <Td className="text-right">{qty(Number(p.min_stock) - Number(p.stock_qty))} {p.unit}</Td>
        </tr>
      ))}
    </Table>
  );
}
