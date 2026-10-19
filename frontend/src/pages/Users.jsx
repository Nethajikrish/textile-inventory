import { useCallback, useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext.jsx';
import { Badge, Button, ErrorBox, Field, Modal, Select, Table, Td } from '../components/ui.jsx';
import { errMsg, fmtDate } from '../utils/format';

const emptyForm = { name: '', email: '', role_id: '', is_active: true, password: '' };

export default function Users() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [form, setForm] = useState(null);
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.get('/users').then((r) => setUsers(r.data.data)).catch(() => setError('Failed to load users'));
  }, []);
  useEffect(load, [load]);
  useEffect(() => { api.get('/roles').then((r) => setRoles(r.data.data)); }, []);

  const open = (u) => {
    setEditId(u?.id ?? null);
    setForm(u ? { name: u.name, email: u.email, role_id: u.role_id, is_active: !!Number(u.is_active), password: '' } : emptyForm);
    setError('');
  };

  const save = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (editId) await api.put(`/users/${editId}`, form);
      else await api.post('/users', form);
      setForm(null);
      load();
    } catch (err) {
      setError(errMsg(err, 'Save failed'));
    }
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">
          <b>Admin</b>: everything. <b>Manager</b>: everything except users. <b>Staff</b>: view data, create invoices, manage customers.
        </p>
        <Button onClick={() => open(null)}>Add user</Button>
      </div>
      {error && !form && <ErrorBox>{error}</ErrorBox>}
      <Table columns={[{ label: 'Name' }, { label: 'Email' }, { label: 'Role' }, { label: 'Status' }, { label: 'Created' }, { label: '' }]}>
        {users.map((u) => (
          <tr key={u.id} className="border-t">
            <Td className="font-medium">{u.name}{u.id === me.id && <span className="ml-1 text-xs text-slate-400">(you)</span>}</Td>
            <Td>{u.email}</Td>
            <Td>{u.role}</Td>
            <Td>{Number(u.is_active) ? <Badge tone="completed">active</Badge> : <Badge tone="cancelled">disabled</Badge>}</Td>
            <Td>{fmtDate(u.created_at)}</Td>
            <Td className="text-right"><button onClick={() => open(u)} className="text-indigo-600 hover:underline">Edit</button></Td>
          </tr>
        ))}
      </Table>

      {form && (
        <Modal title={editId ? 'Edit user' : 'New user'} onClose={() => setForm(null)}>
          <form onSubmit={save} className="space-y-4">
            <ErrorBox>{error}</ErrorBox>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name *" value={form.name} onChange={set('name')} required />
              <Field label="Email *" type="email" value={form.email} onChange={set('email')} required />
              <Select label="Role *" value={form.role_id} onChange={set('role_id')} options={roles} required />
              <Field
                label={editId ? 'New password (leave blank to keep)' : 'Password * (min 8 characters)'}
                type="password"
                value={form.password}
                onChange={set('password')}
                minLength={8}
                required={!editId}
                autoComplete="new-password"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={form.is_active} onChange={set('is_active')} /> Active (can sign in)
            </label>
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
