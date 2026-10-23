import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext.jsx';
import { Button, ErrorBox, Field, Modal, Pagination, Select, Table, Td } from '../components/ui.jsx';
import { assetUrl, errMsg, money, qty } from '../utils/format';
import { sellingPrice } from '../utils/bill';

const GST_RATES = [0, 5, 12, 18, 28].map((r) => ({ id: String(r), name: `${r}%` }));
const FABRIC_TYPES = ['Cotton', 'Silk', 'Polyester', 'Linen', 'Wool', 'Rayon', 'Viscose', 'Nylon', 'Denim', 'Blended'];

const emptyForm = {
  sku: '', barcode: '', name: '', brand: '', model: '', size: '', category_id: '', unit_id: '', fabric_type: '', color: '',
  gsm: '', width_inch: '', lot_no: '', purchase_price: '', mrp: '', discount_type: 'percent', discount_value: '',
  gst_percent: '5', min_stock: '', opening_stock: '',
};

export default function Products() {
  const { user } = useAuth();
  const canWrite = ['Admin', 'Manager'].includes(user.role);
  const [params] = useSearchParams();

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [lowOnly, setLowOnly] = useState(params.get('low') === '1');
  const [categories, setCategories] = useState([]);
  const [units, setUnits] = useState([]);
  const [form, setForm] = useState(null); // null = modal closed
  const [editing, setEditing] = useState(null); // product being edited
  const [imageFile, setImageFile] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [picked, setPicked] = useState({}); // product id -> true, for printing stickers
  const perPage = 10;

  const load = useCallback(() => {
    api
      .get('/products', { params: { page, per_page: perPage, search, category_id: categoryId, low: lowOnly ? 1 : '' } })
      .then((res) => {
        setItems(res.data.data.items);
        setTotal(res.data.data.total);
      })
      .catch(() => setError('Failed to load products'));
  }, [page, search, categoryId, lowOnly]);

  useEffect(load, [load]);

  useEffect(() => {
    api.get('/categories').then((r) => setCategories(r.data.data));
    api.get('/units').then((r) => setUnits(r.data.data));
  }, []);

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setImageFile(null);
    setError('');
  };

  const openEdit = (p) => {
    setEditing(p);
    const f = Object.fromEntries(Object.keys(emptyForm).map((k) => [k, p[k] ?? '']));
    f.gst_percent = String(Number(p.gst_percent)); // "5.00" -> "5" to match the GST options
    setForm(f);
    setImageFile(null);
    setError('');
  };

  const save = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      let id = editing?.id;
      if (id) await api.put(`/products/${id}`, form);
      else id = (await api.post('/products', form)).data.data.id;
      if (imageFile) {
        const fd = new FormData();
        fd.append('image', imageFile);
        await api.post(`/products/${id}/image`, fd);
      }
      setForm(null);
      load();
    } catch (err) {
      setError(errMsg(err, 'Save failed'));
    } finally {
      setSaving(false);
    }
  };

  const removeImage = async () => {
    await api.delete(`/products/${editing.id}/image`);
    setEditing({ ...editing, image: null });
    load();
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this product? Its purchase and sales history is kept.')) return;
    await api.delete(`/products/${id}`);
    load();
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const filter = (setter) => (e) => { setPage(1); setter(e.target.value); };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <input
            value={search}
            onChange={filter(setSearch)}
            placeholder="Search name, SKU, barcode, brand, color..."
            className="w-72 rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <Select value={categoryId} onChange={filter(setCategoryId)} options={categories} placeholder="All categories" />
          <label className="flex items-center gap-2 pb-2 text-sm text-slate-600">
            <input type="checkbox" checked={lowOnly} onChange={(e) => { setPage(1); setLowOnly(e.target.checked); }} />
            Low stock only
          </label>
        </div>
        <div className="flex gap-2">
          <Link
            to={`/labels?items=${Object.keys(picked).map((id) => `${id}:1`).join(',')}`}
            className="rounded border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Print stickers{Object.keys(picked).length ? ` (${Object.keys(picked).length})` : ''}
          </Link>
          {canWrite && <Button onClick={openNew}>Add product</Button>}
        </div>
      </div>

      {error && !form && <div className="text-sm text-red-600">{error}</div>}

      <Table columns={[{ label: '' }, { label: '' }, { label: 'SKU / Barcode' }, { label: 'Name' }, { label: 'Type' }, { label: 'Color / Size' }, { label: 'Lot' }, { label: 'Stock' }, { label: 'Price' }, { label: '' }]} empty="No products found">
        {items.map((p) => (
          <tr key={p.id} className="border-t">
            <Td className="w-8">
              <input
                type="checkbox"
                aria-label="Select for stickers"
                checked={!!picked[p.id]}
                onChange={(e) => setPicked(({ [p.id]: _, ...rest }) => (e.target.checked ? { ...rest, [p.id]: true } : rest))}
              />
            </Td>
            <Td className="w-12">
              {p.image ? (
                <img src={assetUrl(p.image)} alt="" className="h-10 w-10 rounded object-cover" />
              ) : (
                <div className="h-10 w-10 rounded bg-slate-100" />
              )}
            </Td>
            <Td className="font-mono">
              <div>{p.sku}</div>
              {p.barcode && <div className="text-xs text-slate-500">{p.barcode}</div>}
            </Td>
            <Td>
              <div>{p.name}</div>
              {p.brand && <div className="text-xs text-slate-500">{p.brand}</div>}
            </Td>
            <Td>{p.fabric_type}</Td>
            <Td>{[p.color, p.size].filter(Boolean).join(' / ')}</Td>
            <Td>{p.lot_no}</Td>
            <Td className={Number(p.stock_qty) <= Number(p.min_stock) ? 'font-semibold text-red-600' : ''}>
              {qty(p.stock_qty)} {p.unit}
            </Td>
            <Td className="whitespace-nowrap">
              {Number(p.mrp) > Number(p.selling_price) && <div className="text-xs text-slate-400 line-through">{money(p.mrp)}</div>}
              <div>{money(p.selling_price)}</div>
              <div className="text-xs text-slate-500">GST {Number(p.gst_percent)}%</div>
            </Td>
            <Td className="space-x-3 whitespace-nowrap text-right">
              <Link to={`/labels?items=${p.id}:1`} className="text-slate-600 hover:underline">Sticker</Link>
              <Link to={`/stock?tab=ledger&product=${p.id}`} className="text-slate-600 hover:underline">Ledger</Link>
              {canWrite && (
                <>
                  <button onClick={() => openEdit(p)} className="text-indigo-600 hover:underline">Edit</button>
                  <button onClick={() => remove(p.id)} className="text-red-600 hover:underline">Delete</button>
                </>
              )}
            </Td>
          </tr>
        ))}
      </Table>

      <Pagination page={page} perPage={perPage} total={total} onChange={setPage} noun="products" />

      {form && (
        <Modal title={editing ? 'Edit product' : 'New product'} onClose={() => setForm(null)}>
          <form onSubmit={save} className="space-y-4">
            <ErrorBox>{error}</ErrorBox>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="SKU *" value={form.sku} onChange={set('sku')} required />
              <Field label="Name *" value={form.name} onChange={set('name')} required />
              <Field label="Barcode" value={form.barcode} onChange={set('barcode')} placeholder="Auto-generated if blank" />
              <Field label="Brand" value={form.brand} onChange={set('brand')} />
              <Field label="Model" value={form.model} onChange={set('model')} />
              <Select label="Category" value={form.category_id} onChange={set('category_id')} options={categories} />
              <Select label="Unit *" value={form.unit_id} onChange={set('unit_id')} options={units} required />
              <label className="block text-xs text-slate-600">
                Fabric type
                <input list="fabric-types" value={form.fabric_type} onChange={set('fabric_type')} className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
                <datalist id="fabric-types">{FABRIC_TYPES.map((t) => <option key={t} value={t} />)}</datalist>
              </label>
              <Field label="Color" value={form.color} onChange={set('color')} />
              <Field label="Size" value={form.size} onChange={set('size')} placeholder="e.g. M, 32, Free" />
              <Field label="GSM" type="number" min="0" value={form.gsm} onChange={set('gsm')} />
              <Field label="Width (inch)" type="number" min="0" value={form.width_inch} onChange={set('width_inch')} />
              <Field label="Lot / design no." value={form.lot_no} onChange={set('lot_no')} />
              <Field label="Purchase price" type="number" min="0" value={form.purchase_price} onChange={set('purchase_price')} />
              <Field label="MRP / actual price (₹)" type="number" min="0" value={form.mrp} onChange={set('mrp')} />
              <div className="flex items-end gap-1">
                <label className="block text-xs text-slate-600">
                  Discount
                  <select value={form.discount_type} onChange={set('discount_type')} className="mt-1 block rounded border border-slate-300 px-1 py-1.5 text-sm">
                    <option value="percent">%</option>
                    <option value="amount">₹</option>
                  </select>
                </label>
                <Field label=" " type="number" min="0" max={form.discount_type === 'percent' ? '100' : undefined} value={form.discount_value} onChange={set('discount_value')} placeholder="0" className="flex-1" />
              </div>
              <div className="block text-xs text-slate-600">
                Selling price (incl. GST)
                <div className="mt-1 rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm font-semibold text-slate-800">
                  {money(sellingPrice(form.mrp, form.discount_type, form.discount_value))}
                </div>
              </div>
              <Select label="GST %" value={form.gst_percent} onChange={set('gst_percent')} options={GST_RATES} placeholder="Select" required />
              <Field label="Min stock (alert level)" type="number" min="0" value={form.min_stock} onChange={set('min_stock')} />
              {!editing && (
                <Field label="Opening stock" type="number" min="0" value={form.opening_stock} onChange={set('opening_stock')} />
              )}
            </div>
            {editing && (
              <p className="text-xs text-slate-500">
                Current stock: {qty(editing.stock_qty)} {editing.unit}. Change stock through purchases, sales or Stock → Adjust.
              </p>
            )}

            <div className="flex items-center gap-4">
              {editing?.image && <img src={assetUrl(editing.image)} alt="" className="h-16 w-16 rounded object-cover" />}
              <label className="block text-xs text-slate-600">
                Image (JPG, PNG or WebP, max 2 MB)
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setImageFile(e.target.files[0] || null)} className="mt-1 block text-sm" />
              </label>
              {editing?.image && (
                <button type="button" onClick={removeImage} className="text-xs text-red-600 hover:underline">Remove image</button>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setForm(null)}>Cancel</Button>
              <Button disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
