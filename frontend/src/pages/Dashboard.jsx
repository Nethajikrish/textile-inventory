import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import api from '../services/api';

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

  const chartData = data.low_stock.map((p) => ({
    name: p.sku,
    stock: Number(p.stock_qty),
    minimum: Number(p.min_stock),
  }));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card label="Active products" value={data.products} />
        <Card label="Stock value" value={`₹${Number(data.stock_value).toLocaleString('en-IN')}`} />
        <Card label="Low-stock items" value={data.low_stock.length} />
      </div>

      <div className="rounded-lg bg-white p-4 shadow">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Low stock vs minimum level</h2>
        {chartData.length === 0 ? (
          <p className="text-sm text-slate-500">All products are above their minimum stock.</p>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="stock" fill="#ef4444" />
                <Bar dataKey="minimum" fill="#94a3b8" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

function Card({ label, value }) {
  return (
    <div className="rounded-lg bg-white p-4 shadow">
      <div className="text-xs uppercase text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-800">{value}</div>
    </div>
  );
}
