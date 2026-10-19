import { useState } from 'react';
import api from '../services/api';
import { Button, ErrorBox, Field, Modal } from './ui.jsx';
import { errMsg } from '../utils/format';

export default function ChangePassword({ onClose }) {
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm: '' });
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setError('');
    if (form.new_password !== form.confirm) return setError('New passwords do not match');
    try {
      await api.post('/me/password', form);
      setDone(true);
    } catch (err) {
      setError(errMsg(err, 'Could not change password'));
    }
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <Modal title="Change password" onClose={onClose}>
      {done ? (
        <div className="space-y-4">
          <p className="text-sm text-green-700">Your password has been changed.</p>
          <div className="flex justify-end"><Button onClick={onClose}>Close</Button></div>
        </div>
      ) : (
        <form onSubmit={save} className="space-y-3">
          <ErrorBox>{error}</ErrorBox>
          <Field label="Current password" type="password" value={form.current_password} onChange={set('current_password')} required autoComplete="current-password" />
          <Field label="New password (min 8 characters)" type="password" value={form.new_password} onChange={set('new_password')} minLength={8} required autoComplete="new-password" />
          <Field label="Confirm new password" type="password" value={form.confirm} onChange={set('confirm')} minLength={8} required autoComplete="new-password" />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button>Change password</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
