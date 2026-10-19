import { useEffect, useState } from 'react';
import api from '../services/api';
import { addressLines, useCompany, useSetCompany } from '../context/CompanyContext.jsx';
import { Button, ErrorBox, Field } from '../components/ui.jsx';
import { errMsg } from '../utils/format';

// Admin: company name and address shown in the app and printed on sales bills.
export default function Settings() {
  const company = useCompany();
  const setCompany = useSetCompany();
  const [form, setForm] = useState(company);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [saving, setSaving] = useState(false);

  // Fill the form once the details arrive (e.g. when this page is opened directly).
  useEffect(() => setForm(company), [company]);

  const set = (k) => (e) => { setSaved(''); setForm({ ...form, [k]: e.target.value }); };

  const save = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const res = await api.put('/settings', form);
      setCompany(res.data.data);
      setForm(res.data.data);
      setSaved('Company details saved');
    } catch (err) {
      setError(errMsg(err, 'Save failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,36rem)_minmax(0,24rem)]">
      <form onSubmit={save} className="space-y-4 rounded-lg bg-white p-6 shadow">
        <ErrorBox>{error}</ErrorBox>
        {saved && <div className="rounded bg-green-50 px-3 py-2 text-sm text-green-700">{saved}</div>}
        <Field label="Company name *" value={form.company_name} onChange={set('company_name')} required />
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Building No./Flat No." value={form.building_no} onChange={set('building_no')} />
          <Field label="Road/Street" value={form.street} onChange={set('street')} className="sm:col-span-2" />
          <Field label="City/Town/Village" value={form.city} onChange={set('city')} />
          <Field label="District" value={form.district} onChange={set('district')} />
          <Field label="State" value={form.state} onChange={set('state')} />
          <Field label="PIN Code" value={form.pincode} onChange={set('pincode')} inputMode="numeric" maxLength={6} />
          <Field label="Phone" type="tel" value={form.phone} onChange={set('phone')} />
          <Field label="Email" type="email" value={form.email} onChange={set('email')} />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="GSTIN" value={form.gstin} onChange={set('gstin')} maxLength={15} className="sm:col-span-2" />
          <Field label="Barcode prefix" value={form.barcode_prefix} onChange={set('barcode_prefix')} maxLength={6} placeholder="e.g. J" />
        </div>
        <p className="text-xs text-slate-500">
          Products without a barcode get one automatically: prefix + product number, e.g. {(form.barcode_prefix || '').toUpperCase()}0884.
        </p>
        <div className="flex justify-end">
          <Button disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
        </div>
      </form>

      <div className="h-fit rounded-lg bg-white p-6 text-sm shadow">
        <div className="mb-2 text-xs uppercase text-slate-500">Sales bill header preview</div>
        <div className="text-lg font-bold text-slate-800">{form.company_name || '—'}</div>
        {addressLines(form).map((l) => <div key={l} className="text-slate-600">{l}</div>)}
        {form.phone && <div className="text-slate-600">Phone: {form.phone}</div>}
        {form.email && <div className="text-slate-600">{form.email}</div>}
        {form.gstin && <div className="font-medium">GSTIN: {form.gstin.toUpperCase()}</div>}
      </div>
    </div>
  );
}
