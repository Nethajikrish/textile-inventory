import { useCallback, useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext.jsx';
import { Button, ErrorBox, Field, Table, Td } from '../components/ui.jsx';
import { errMsg } from '../utils/format';

export default function Masters() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <MasterList title="Categories" resource="categories" fields={[{ key: 'name', label: 'Name' }]} />
      <MasterList
        title="Units"
        resource="units"
        fields={[{ key: 'name', label: 'Name' }, { key: 'short_name', label: 'Short name' }]}
      />
      <MasterList title="Brands" resource="brands" fields={[{ key: 'name', label: 'Brand name' }]} />
      <MasterList title="Billing counters" resource="counters" fields={[{ key: 'name', label: 'Counter name' }]} />
    </div>
  );
}

function MasterList({ title, resource, fields }) {
  const { user } = useAuth();
  const canWrite = ['Admin', 'Manager'].includes(user.role);
  const blank = Object.fromEntries(fields.map((f) => [f.key, '']));

  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(blank);
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.get(`/${resource}`).then((r) => setRows(r.data.data));
  }, [resource]);
  useEffect(load, [load]);

  const reset = () => { setForm(blank); setEditId(null); setError(''); };

  const save = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (editId) await api.put(`/${resource}/${editId}`, form);
      else await api.post(`/${resource}`, form);
      reset();
      load();
    } catch (err) {
      setError(errMsg(err, 'Save failed'));
    }
  };

  const remove = async (row) => {
    if (!window.confirm(`Delete "${row.name}"?`)) return;
    try {
      await api.delete(`/${resource}/${row.id}`);
      load();
    } catch (err) {
      setError(errMsg(err, 'Delete failed'));
    }
  };

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
      {canWrite && (
        <form onSubmit={save} className="flex flex-wrap items-end gap-2 rounded-lg bg-white p-3 shadow">
          {fields.map((f) => (
            <Field key={f.key} label={f.label} value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} required className="flex-1" />
          ))}
          <Button>{editId ? 'Update' : 'Add'}</Button>
          {editId && <Button type="button" variant="secondary" onClick={reset}>Cancel</Button>}
        </form>
      )}
      <ErrorBox>{error}</ErrorBox>
      <Table columns={[...fields.map((f) => ({ label: f.label })), { label: '' }]}>
        {rows.map((r) => (
          <tr key={r.id} className="border-t">
            {fields.map((f) => <Td key={f.key}>{r[f.key]}</Td>)}
            <Td className="space-x-3 text-right">
              {canWrite && (
                <>
                  <button onClick={() => { setEditId(r.id); setForm(Object.fromEntries(fields.map((f) => [f.key, r[f.key]]))); }} className="text-indigo-600 hover:underline">Edit</button>
                  <button onClick={() => remove(r)} className="text-red-600 hover:underline">Delete</button>
                </>
              )}
            </Td>
          </tr>
        ))}
      </Table>
    </section>
  );
}
