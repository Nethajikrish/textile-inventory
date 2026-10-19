import { useCallback, useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext.jsx';
import { Button, ErrorBox, Field, Modal, Pagination, Table, Td, TextArea } from '../components/ui.jsx';
import { errMsg } from '../utils/format';

const emptyForm = { name: '', phone: '', email: '', gstin: '', address: '' };

// Suppliers and customers: resource = "suppliers" | "customers"
export default function Parties({ resource }) {
  const { user } = useAuth();
  const isManager = ['Admin', 'Manager'].includes(user.role);
  const canEdit = isManager || resource === 'customers';
  const noun = resource === 'suppliers' ? 'supplier' : 'customer';

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(null);
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState('');
  const perPage = 10;

  const load = useCallback(() => {
    api
      .get(`/${resource}`, { params: { page, per_page: perPage, search } })
      .then((res) => {
        setItems(res.data.data.items);
        setTotal(res.data.data.total);
      })
      .catch(() => setError(`Failed to load ${resource}`));
  }, [resource, page, search]);
  useEffect(load, [load]);

  const open = (row) => {
    setEditId(row?.id ?? null);
    setForm(row ? Object.fromEntries(Object.keys(emptyForm).map((k) => [k, row[k] ?? ''])) : emptyForm);
    setError('');
  };

  const save = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (editId) await api.put(`/${resource}/${editId}`, form);
      else await api.post(`/${resource}`, form);
      setForm(null);
      load();
    } catch (err) {
      setError(errMsg(err, 'Save failed'));
    }
  };

  const remove = async (row) => {
    if (!window.confirm(`Delete ${noun} "${row.name}"?`)) return;
    try {
      await api.delete(`/${resource}/${row.id}`);
      load();
    } catch (err) {
      setError(errMsg(err, 'Delete failed'));
    }
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <input
          value={search}
          onChange={(e) => { setPage(1); setSearch(e.target.value); }}
          placeholder="Search name, phone, email, GSTIN..."
          className="w-72 rounded border border-slate-300 px-3 py-2 text-sm"
        />
        {canEdit && <Button onClick={() => open(null)}>Add {noun}</Button>}
      </div>

      {error && !form && <ErrorBox>{error}</ErrorBox>}

      <Table columns={[{ label: 'Name' }, { label: 'Phone' }, { label: 'Email' }, { label: 'GSTIN' }, { label: 'Address' }, { label: '' }]} empty={`No ${resource} found`}>
        {items.map((r) => (
          <tr key={r.id} className="border-t">
            <Td className="font-medium">{r.name}</Td>
            <Td>{r.phone}</Td>
            <Td>{r.email}</Td>
            <Td className="font-mono">{r.gstin}</Td>
            <Td className="max-w-xs truncate">{r.address}</Td>
            <Td className="space-x-3 whitespace-nowrap text-right">
              {canEdit && <button onClick={() => open(r)} className="text-indigo-600 hover:underline">Edit</button>}
              {isManager && <button onClick={() => remove(r)} className="text-red-600 hover:underline">Delete</button>}
            </Td>
          </tr>
        ))}
      </Table>

      <Pagination page={page} perPage={perPage} total={total} onChange={setPage} noun={resource} />

      {form && (
        <Modal title={editId ? `Edit ${noun}` : `New ${noun}`} onClose={() => setForm(null)}>
          <form onSubmit={save} className="space-y-4">
            <ErrorBox>{error}</ErrorBox>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name *" value={form.name} onChange={set('name')} required />
              <Field label="Phone" value={form.phone} onChange={set('phone')} />
              <Field label="Email" type="email" value={form.email} onChange={set('email')} />
              <Field label="GSTIN" value={form.gstin} onChange={set('gstin')} maxLength={15} placeholder="33ABCDE1234F1Z5" />
              <TextArea label="Address" value={form.address} onChange={set('address')} className="sm:col-span-2" />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setForm(null)}>Cancel</Button>
              <Button>Save</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
