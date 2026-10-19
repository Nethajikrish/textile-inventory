import api from '../services/api';

export const money = (n) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const qty = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });

export const fmtDate = (d) =>
  d ? new Date(d.length === 10 ? `${d}T00:00:00` : d.replace(' ', 'T')).toLocaleDateString('en-IN') : '';

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const today = () => iso(new Date());
export const monthStart = () => {
  const d = new Date();
  return iso(new Date(d.getFullYear(), d.getMonth(), 1));
};

// Pulls the API's message out of an axios error.
export const errMsg = (err, fallback = 'Something went wrong') => err.response?.data?.message || fallback;

// Uploaded files live next to the API folder: .../backend/uploads/...
export const assetUrl = (path) => (path ? `${api.defaults.baseURL.replace(/\/api\/?$/, '')}/${path}` : null);

// Also used for search, so typing or scanning a barcode finds the product.
export const productLabel = (p) =>
  [`${p.sku} — ${p.name}`, [p.brand, p.color, p.size, p.lot_no].filter(Boolean).join(' / '), p.barcode]
    .filter(Boolean).join('  ·  ');

// columns: [{ key, label }]. Writes a UTF-8 CSV with BOM so Excel opens it with ₹ and accents intact.
export function downloadCsv(filename, columns, rows) {
  const cell = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map((c) => cell(c.label)).join(','), ...rows.map((r) => columns.map((c) => cell(r[c.key])).join(','))];
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// 125050.5 -> "Rupees One Lakh Twenty Five Thousand Fifty and Fifty Paise Only" (Indian numbering)
export function rupeesInWords(amount) {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
    'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (n) => (n < 20 ? ones[n] : `${tens[Math.floor(n / 10)]} ${ones[n % 10]}`.trim());
  const three = (n) => [n >= 100 && `${ones[Math.floor(n / 100)]} Hundred`, two(n % 100)].filter(Boolean).join(' ');
  const words = (n) => {
    if (n === 0) return 'Zero';
    const parts = [];
    const crore = Math.floor(n / 10000000);
    if (crore) parts.push(`${words(crore)} Crore`);
    n %= 10000000;
    const lakh = Math.floor(n / 100000);
    if (lakh) parts.push(`${two(lakh)} Lakh`);
    n %= 100000;
    const thousand = Math.floor(n / 1000);
    if (thousand) parts.push(`${two(thousand)} Thousand`);
    n %= 1000;
    if (n) parts.push(three(n));
    return parts.join(' ');
  };
  const total = Math.round(Number(amount) * 100);
  const rupees = Math.floor(total / 100);
  const paise = total % 100;
  return `Rupees ${words(rupees)}${paise ? ` and ${two(paise)} Paise` : ''} Only`;
}
