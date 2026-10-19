import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import api from '../services/api';
import { Badge, Card, Table, Td } from '../components/ui.jsx';
import { fmtDate, money, qty } from '../utils/format';

const compact = (n) => `₹${Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(n)}`;

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/dashboard')
      .then((res) => setData(res.data.data))
      .catch(() => setError('Failed to load dashboard'));
  }, []);

  if (error) return <div className="text-red-600">{error}</div>;
  if (!data) return <div className="text-slate-500">Loading...</div>;

  const lowChart = data.low_stock.map((p) => ({ name: p.sku, stock: Number(p.stock_qty), minimum: Number(p.min_stock) }));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card label="Stock value (at cost)" value={money(data.stock_value)} />
        <Card label="Active products" value={data.products} />
        <Card label="Low-stock items" value={data.low_stock_count} tone={data.low_stock_count > 0 ? 'warn' : undefined} />
        <Card label="Sales this month" value={money(data.month_sales)} />
        <Card label="Purchases this month" value={money(data.month_purchases)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Sales vs purchases (last 6 months)">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.monthly}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={compact} tick={{ fontSize: 12 }} width={60} />
                <Tooltip formatter={(v) => money(v)} />
                <Legend />
                <Bar dataKey="sales" name="Sales" fill="#4f46e5" radius={[3, 3, 0, 0]} />
                <Bar dataKey="purchases" name="Purchases" fill="#94a3b8" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Low stock vs minimum level" link={data.low_stock_count > 0 && { to: '/stock?tab=alerts', label: 'All alerts' }}>
          {lowChart.length === 0 ? (
            <p className="text-sm text-slate-500">All products are above their minimum stock.</p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={lowChart}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v) => qty(v)} />
                  <Legend />
                  <Bar dataKey="stock" name="In stock" fill="#ef4444" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="minimum" name="Minimum" fill="#94a3b8" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Recent sales" link={{ to: '/sales?tab=list', label: 'All sales' }}>
          <Table columns={[{ label: 'Invoice' }, { label: 'Date' }, { label: 'Customer' }, { label: 'Amount', className: 'text-right' }]} empty="No sales yet">
            {data.recent_sales.map((s) => (
              <tr key={s.id} className="border-t">
                <Td><Link to={`/sales/${s.id}/print`} className="font-mono text-indigo-600 hover:underline">{s.invoice_no}</Link></Td>
                <Td>{fmtDate(s.sale_date)}</Td>
                <Td>{s.customer} {s.status === 'cancelled' && <Badge>cancelled</Badge>}</Td>
                <Td className="text-right">{money(s.total_amount)}</Td>
              </tr>
            ))}
          </Table>
        </Panel>
        <Panel title="Recent purchases" link={{ to: '/purchases', label: 'All purchases' }}>
          <Table columns={[{ label: 'PO no.' }, { label: 'Date' }, { label: 'Supplier' }, { label: 'Status' }, { label: 'Amount', className: 'text-right' }]} empty="No purchases yet">
            {data.recent_purchases.map((p) => (
              <tr key={p.id} className="border-t">
                <Td className="font-mono">{p.purchase_no}</Td>
                <Td>{fmtDate(p.purchase_date)}</Td>
                <Td>{p.supplier}</Td>
                <Td><Badge>{p.status}</Badge></Td>
                <Td className="text-right">{money(p.total_amount)}</Td>
              </tr>
            ))}
          </Table>
        </Panel>
      </div>
    </div>
  );
}

function Panel({ title, link, children }) {
  return (
    <section className="rounded-lg bg-white p-4 shadow">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
        {link && <Link to={link.to} className="text-sm text-indigo-600 hover:underline">{link.label}</Link>}
      </div>
      {children}
    </section>
  );
}
