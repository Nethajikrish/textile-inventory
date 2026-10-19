import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext.jsx';
import { Badge, Button, ErrorBox, Field, Modal, Pagination, Select, Table, Td, TextArea } from '../components/ui.jsx';
import ItemsEditor, { blankItem, itemsTotal } from '../components/ItemsEditor.jsx';
import { errMsg, fmtDate, money, qty, today } from '../utils/format';

const STATUSES = [{ id: 'ordered', name: 'Ordered' }, { id: 'received', name: 'Received' }, { id: 'cancelled', name: 'Cancelled' }];

export default function Purchases() {
  const { user } = useAuth();
  const canWrite = ['Admin', 'Manager'].includes(user.role);

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ search: '', status: '', from: '', to: '' });
  const [creating, setCreating] = useState(false);
  const [viewId, setViewId] = useState(null);
  const [error, setError] = useState('');
  const perPage = 10;

  const load = useCallback(() => {
    api
      .get('/purchases', { params: { page, per_page: perPage, ...filters } })
      .then((res) => {
        setItems(res.data.data.items);
        setTotal(res.data.data.total);
      })
      .catch(() => setError('Failed to load purchases'));
  }, [page, filters]);
  useEffect(load, [load]);

  const setFilter = (k) => (e) => { setPage(1); setFilters({ ...filters, [k]: e.target.value }); };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <input value={filters.search} onChange={setFilter('search')} placeholder="Search PO no. or supplier..." className="w-64 rounded border border-slate-300 px-3 py-2 text-sm" />
          <Select value={filters.status} onChange={setFilter('status')} options={STATUSES} placeholder="All statuses" />
          <Field label="From" type="date" value={filters.from} onChange={setFilter('from')} />
          <Field label="To" type="date" value={filters.to} onChange={setFilter('to')} />
        </div>
        {canWrite && <Button onClick={() => setCreating(true)}>New purchase</Button>}
      </div>

      <ErrorBox>{error}</ErrorBox>

      <Table columns={[{ label: 'PO no.' }, { label: 'Date' }, { label: 'Supplier' }, { label: 'Status' }, { label: 'Amount', className: 'text-right' }, { label: '' }]} empty="No purchases found">
        {items.map((p) => (
          <tr key={p.id} className="border-t">
            <Td className="font-mono">{p.purchase_no}</Td>
            <Td>{fmtDate(p.purchase_date)}</Td>
            <Td>{p.supplier}</Td>
            <Td><Badge>{p.status}</Badge></Td>
            <Td className="text-right">{money(p.total_amount)}</Td>
            <Td className="space-x-3 whitespace-nowrap text-right">
              <button onClick={() => setViewId(p.id)} className="text-indigo-600 hover:underline">View</button>
              <Link to={`/purchases/${p.id}/print`} className="text-slate-600 hover:underline">Print</Link>
            </Td>
          </tr>
        ))}
      </Table>

      <Pagination page={page} perPage={perPage} total={total} onChange={setPage} noun="purchases" />

      {creating && <NewPurchase onClose={() => setCreating(false)} onSaved={(id) => { setCreating(false); load(); setViewId(id); }} />}
      {viewId && <PurchaseDetail id={viewId} canWrite={canWrite} onClose={() => setViewId(null)} onChanged={load} />}
    </div>
  );
}

function NewPurchase({ onClose, onSaved }) {
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState({ supplier_id: '', purchase_date: today(), notes: '', receive: true });
  const [lines, setLines] = useState([blankItem()]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/suppliers', { params: { all: 1 } }).then((r) => setSuppliers(r.data.data));
    api.get('/products', { params: { all: 1 } }).then((r) => setProducts(r.data.data));
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const res = await api.post('/purchases', { ...form, items: lines });
      onSaved(res.data.data.id);
    } catch (err) {
      setError(errMsg(err, 'Save failed'));
      setSaving(false);
    }
  };

  return (
    <Modal title="New purchase" onClose={onClose} wide>
      <form onSubmit={save} className="space-y-4">
        <ErrorBox>{error}</ErrorBox>
        <div className="grid gap-3 sm:grid-cols-3">
          <Select label="Supplier" value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })} options={suppliers} placeholder="No supplier (direct purchase)" />
          <Field label="Date *" type="date" value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} required />
          <TextArea label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={1} />
        </div>
        <ItemsEditor products={products} items={lines} onChange={setLines} priceField="purchase_price" />
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.receive} onChange={(e) => setForm({ ...form, receive: e.target.checked })} />
            Goods received now (add to stock immediately)
          </label>
          <div className="text-lg font-semibold">Total: {money(itemsTotal(lines))}</div>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={saving}>{saving ? 'Saving...' : form.receive ? 'Save & receive' : 'Save order'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function PurchaseDetail({ id, canWrite, onClose, onChanged }) {
  const [p, setP] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.get(`/purchases/${id}`).then((r) => setP(r.data.data)).catch(() => setError('Failed to load purchase'));
  }, [id]);
  useEffect(load, [load]);

  const act = async (action, confirmText) => {
    if (!window.confirm(confirmText)) return;
    setError('');
    try {
      await api.post(`/purchases/${id}/${action}`);
      load();
      onChanged();
    } catch (err) {
      setError(errMsg(err));
    }
  };

  return (
    <Modal title={p ? `Purchase ${p.purchase_no}` : 'Purchase'} onClose={onClose} wide>
      <ErrorBox>{error}</ErrorBox>
      {p && (
        <div className="space-y-4">
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <div className="font-medium">{p.supplier}</div>
              {p.supplier_gstin && <div className="text-slate-500">GSTIN: {p.supplier_gstin}</div>}
              {p.supplier_address && <div className="text-slate-500">{p.supplier_address}</div>}
            </div>
            <div className="sm:text-right">
              <div>Date: {fmtDate(p.purchase_date)}</div>
              <div>Status: <Badge>{p.status}</Badge></div>
              {p.received_at && <div className="text-slate-500">Received {fmtDate(p.received_at)}</div>}
              {p.created_by_name && <div className="text-slate-500">By {p.created_by_name}</div>}
            </div>
          </div>
          <Table columns={[{ label: 'Product' }, { label: 'Color / Lot' }, { label: 'Qty', className: 'text-right' }, { label: 'Rate', className: 'text-right' }, { label: 'Amount', className: 'text-right' }]}>
            {p.items.map((it) => (
              <tr key={it.id} className="border-t">
                <Td>{it.sku} — {it.name}</Td>
                <Td>{[it.color, it.lot_no].filter(Boolean).join(' / ')}</Td>
                <Td className="text-right">{qty(it.qty)} {it.unit}</Td>
                <Td className="text-right">{money(it.rate)}</Td>
                <Td className="text-right">{money(it.amount)}</Td>
              </tr>
            ))}
          </Table>
          <div className="text-right text-lg font-semibold">Total: {money(p.total_amount)}</div>
          {p.notes && <p className="text-sm text-slate-600">Notes: {p.notes}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <Link to={`/purchases/${p.id}/print`} className="rounded border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
              Print / PDF
            </Link>
            <Link
              to={`/labels?items=${p.items.map((it) => `${it.product_id}:${Math.max(1, Math.ceil(Number(it.qty)))}`).join(',')}`}
              className="rounded border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              title="One sticker per unit received"
            >
              Barcode stickers
            </Link>
            {canWrite && p.status === 'ordered' && (
              <>
                <Button variant="secondary" onClick={() => act('cancel', 'Cancel this purchase order?')}>Cancel order</Button>
                <Button onClick={() => act('receive', 'Mark goods as received? This adds the quantities to stock.')}>Receive goods</Button>
              </>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
