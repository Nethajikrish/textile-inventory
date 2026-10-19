import { useCallback, useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext.jsx';

const emptyForm = {
  sku: '', name: '', category_id: '', unit_id: '', fabric_type: '', color: '',
  gsm: '', width_inch: '', lot_no: '', purchase_price: '', selling_price: '', min_stock: '',
};

export default function Products() {
  const { user } = useAuth();
  const canWrite = ['Admin', 'Manager'].includes(user.role);

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [categories, setCategories] = useState([]);
  const [units, setUnits] = useState([]);
  const [form, setForm] = useState(null); // null = modal closed
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState('');
  const perPage = 10;

  const load = useCallback(() => {
    api
      .get('/products', { params: { page, per_page: perPage, search } })
      .then((res) => {
        setItems(res.data.data.items);
        setTotal(res.data.data.total);
      })
      .catch(() => setError('Failed to load products'));
  }, [page, search]);

  useEffect(load, [load]);

  useEffect(() => {
    api.get('/categories').then((r) => setCategories(r.data.data));
    api.get('/units').then((r) => setUnits(r.data.data));
  }, []);

  const openNew = () => {
    setEditId(null);
    setForm(emptyForm);
    setError('');
  };

  const openEdit = (p) => {
    setEditId(p.id);
    setForm(Object.fromEntries(Object.keys(emptyForm).map((k) => [k, p[k] ?? ''])));
    setError('');
  };

  const save = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (editId) await api.put(`/products/${editId}`, form);
      else await api.post('/products', form);
      setForm(null);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Save failed');
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this product?')) return;
    await api.delete(`/products/${id}`);
    load();
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const pages = Math.max(1, Math.ceil(total / perPage));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <input
          value={search}
          onChange={(e) => { setPage(1); setSearch(e.target.value); }}
          placeholder="Search name, SKU, color, lot..."
          className="w-72 rounded border border-slate-300 px-3 py-2 text-sm"
        />
        {canWrite && (
          <button onClick={openNew} className="rounded bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700">
            Add product
          </button>
        )}
      </div>

      {error && !form && <div className="text-sm text-red-600">{error}</div>}

      <div className="overflow-x-auto rounded-lg bg-white shadow">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              {['SKU', 'Name', 'Type', 'Color', 'Lot', 'Stock', 'Price', ''].map((h) => (
                <th key={h} className="px-4 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="px-4 py-2 font-mono">{p.sku}</td>
                <td className="px-4 py-2">{p.name}</td>
                <td className="px-4 py-2">{p.fabric_type}</td>
                <td className="px-4 py-2">{p.color}</td>
                <td className="px-4 py-2">{p.lot_no}</td>
                <td className={`px-4 py-2 ${Number(p.stock_qty) <= Number(p.min_stock) ? 'font-semibold text-red-600' : ''}`}>
                  {Number(p.stock_qty)} {p.unit}
                </td>
                <td className="px-4 py-2">₹{Number(p.selling_price).toLocaleString('en-IN')}</td>
                <td className="px-4 py-2 text-right space-x-3">
                  {canWrite && (
                    <>
                      <button onClick={() => openEdit(p)} className="text-indigo-600 hover:underline">Edit</button>
                      <button onClick={() => remove(p.id)} className="text-red-600 hover:underline">Delete</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan="8" className="px-4 py-6 text-center text-slate-500">No products found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-600">
        <span>{total} products</span>
        <div className="space-x-2">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded border px-3 py-1 disabled:opacity-40">Prev</button>
          <span>{page} / {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="rounded border px-3 py-1 disabled:opacity-40">Next</button>
        </div>
      </div>

      {form && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={save} className="w-full max-w-2xl space-y-4 rounded-lg bg-white p-6 shadow-lg">
            <h2 className="text-lg font-semibold">{editId ? 'Edit product' : 'New product'}</h2>
            {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="SKU *" value={form.sku} onChange={set('sku')} required />
              <Field label="Name *" value={form.name} onChange={set('name')} required />
              <Select label="Category" value={form.category_id} onChange={set('category_id')} options={categories} />
              <Select label="Unit *" value={form.unit_id} onChange={set('unit_id')} options={units} required />
              <Field label="Fabric type" value={form.fabric_type} onChange={set('fabric_type')} />
              <Field label="Color" value={form.color} onChange={set('color')} />
              <Field label="GSM" type="number" value={form.gsm} onChange={set('gsm')} />
              <Field label="Width (inch)" type="number" value={form.width_inch} onChange={set('width_inch')} />
              <Field label="Lot / design no." value={form.lot_no} onChange={set('lot_no')} />
              <Field label="Purchase price" type="number" value={form.purchase_price} onChange={set('purchase_price')} />
              <Field label="Selling price" type="number" value={form.selling_price} onChange={set('selling_price')} />
              <Field label="Min stock" type="number" value={form.min_stock} onChange={set('min_stock')} />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setForm(null)} className="rounded border px-4 py-2 text-sm">Cancel</button>
              <button className="rounded bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700">Save</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function Field({ label, ...props }) {
  return (
    <label className="block text-xs text-slate-600">
      {label}
      <input {...props} step="any" className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
    </label>
  );
}

function Select({ label, options, ...props }) {
  return (
    <label className="block text-xs text-slate-600">
      {label}
      <select {...props} className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm">
        <option value="">Select</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.name}</option>
        ))}
      </select>
    </label>
  );
}
