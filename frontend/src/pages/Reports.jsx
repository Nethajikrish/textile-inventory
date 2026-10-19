import { useEffect, useState } from 'react';
import api from '../services/api';
import { Badge, Button, ErrorBox, Field, Select, Table, Tabs, Td } from '../components/ui.jsx';
import { downloadCsv, fmtDate, money, monthStart, qty, today } from '../utils/format';

// Each report: endpoint, which filters it takes, columns (key, label, type) and which columns get a total.
const REPORTS = {
  stock: {
    label: 'Stock',
    endpoint: '/reports/stock',
    filters: ['category', 'low'],
    columns: [
      { key: 'sku', label: 'SKU' }, { key: 'name', label: 'Product' }, { key: 'category', label: 'Category' },
      { key: 'color', label: 'Color' }, { key: 'lot_no', label: 'Lot' }, { key: 'unit', label: 'Unit' },
      { key: 'stock_qty', label: 'Stock', type: 'qty' }, { key: 'min_stock', label: 'Min', type: 'qty' },
      { key: 'purchase_price', label: 'Cost', type: 'money' }, { key: 'stock_value', label: 'Value', type: 'money' },
    ],
    totals: ['stock_value'],
  },
  purchases: {
    label: 'Purchases',
    endpoint: '/reports/purchases',
    filters: ['dates', 'supplier', 'status'],
    columns: [
      { key: 'purchase_no', label: 'PO no.' }, { key: 'purchase_date', label: 'Date', type: 'date' },
      { key: 'supplier', label: 'Supplier' }, { key: 'gstin', label: 'GSTIN' }, { key: 'status', label: 'Status', type: 'badge' },
      { key: 'items', label: 'Items', type: 'qty' }, { key: 'total_amount', label: 'Amount', type: 'money' },
    ],
    totals: ['total_amount'],
  },
  sales: {
    label: 'Sales',
    endpoint: '/reports/sales',
    filters: ['dates', 'customer'],
    columns: [
      { key: 'invoice_no', label: 'Invoice no.' }, { key: 'sale_date', label: 'Date', type: 'date' },
      { key: 'customer', label: 'Customer' }, { key: 'gstin', label: 'GSTIN' },
      { key: 'subtotal', label: 'Subtotal', type: 'money' }, { key: 'discount_amount', label: 'Offer', type: 'money' },
      { key: 'taxable_value', label: 'Taxable value', type: 'money' }, { key: 'tax_percent', label: 'GST %', type: 'qty' },
      { key: 'tax_amount', label: 'GST', type: 'money' }, { key: 'total_amount', label: 'Total', type: 'money' },
    ],
    totals: ['subtotal', 'discount_amount', 'taxable_value', 'tax_amount', 'total_amount'],
  },
  supplierWise: {
    label: 'Supplier-wise',
    endpoint: '/reports/supplier-wise',
    filters: ['dates'],
    columns: [
      { key: 'supplier', label: 'Supplier' }, { key: 'gstin', label: 'GSTIN' },
      { key: 'purchases', label: 'Purchases', type: 'qty' }, { key: 'total_qty', label: 'Total qty', type: 'qty' },
      { key: 'total_amount', label: 'Amount', type: 'money' },
    ],
    totals: ['purchases', 'total_amount'],
  },
};

const numeric = (c) => c.type === 'money' || c.type === 'qty';
const show = (c, v) =>
  c.type === 'money' ? money(v) : c.type === 'qty' ? qty(v) : c.type === 'date' ? fmtDate(v) : c.type === 'badge' ? <Badge>{v}</Badge> : v;

export default function Reports() {
  const [key, setKey] = useState('stock');
  const [filters, setFilters] = useState({ from: monthStart(), to: today(), category_id: '', supplier_id: '', customer_id: '', status: '', low: '' });
  const [lists, setLists] = useState({ categories: [], suppliers: [], customers: [] });
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const report = REPORTS[key];

  useEffect(() => {
    Promise.all([
      api.get('/categories'),
      api.get('/suppliers', { params: { all: 1 } }),
      api.get('/customers', { params: { all: 1 } }),
    ]).then(([c, s, cu]) => setLists({ categories: c.data.data, suppliers: s.data.data, customers: cu.data.data }));
  }, []);

  useEffect(() => {
    setRows(null);
    setError('');
    const f = report.filters;
    const params = {
      ...(f.includes('dates') && { from: filters.from, to: filters.to }),
      ...(f.includes('category') && { category_id: filters.category_id }),
      ...(f.includes('low') && { low: filters.low }),
      ...(f.includes('supplier') && { supplier_id: filters.supplier_id }),
      ...(f.includes('customer') && { customer_id: filters.customer_id }),
      ...(f.includes('status') && { status: filters.status }),
    };
    let live = true; // ignore a slow response from a previous report/filter
    api
      .get(report.endpoint, { params })
      .then((r) => live && setRows(r.data.data))
      .catch(() => live && setError('Failed to load report'));
    return () => { live = false; };
  }, [report, filters]);

  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.type === 'checkbox' ? (e.target.checked ? '1' : '') : e.target.value });
  const totals = Object.fromEntries(report.totals.map((k) => [k, (rows || []).reduce((s, r) => s + Number(r[k] || 0), 0)]));

  const exportCsv = () => {
    const suffix = report.filters.includes('dates') ? `_${filters.from}_to_${filters.to}` : `_${today()}`;
    downloadCsv(`${report.label.toLowerCase().replace(/\W+/g, '-')}-report${suffix}.csv`, report.columns, rows);
  };

  return (
    <div className="space-y-4">
      <Tabs tabs={Object.entries(REPORTS).map(([k, r]) => ({ key: k, label: r.label }))} value={key} onChange={setKey} />

      <div className="flex flex-wrap items-end gap-3">
        {report.filters.includes('dates') && (
          <>
            <Field label="From" type="date" value={filters.from} onChange={set('from')} />
            <Field label="To" type="date" value={filters.to} onChange={set('to')} />
          </>
        )}
        {report.filters.includes('category') && (
          <Select label="Category" value={filters.category_id} onChange={set('category_id')} options={lists.categories} placeholder="All categories" />
        )}
        {report.filters.includes('supplier') && (
          <Select label="Supplier" value={filters.supplier_id} onChange={set('supplier_id')} options={lists.suppliers} placeholder="All suppliers" />
        )}
        {report.filters.includes('customer') && (
          <Select label="Customer" value={filters.customer_id} onChange={set('customer_id')} options={lists.customers} placeholder="All customers" />
        )}
        {report.filters.includes('status') && (
          <Select label="Status" value={filters.status} onChange={set('status')} options={[{ id: 'ordered', name: 'Ordered' }, { id: 'received', name: 'Received' }, { id: 'cancelled', name: 'Cancelled' }]} placeholder="Ordered + received" />
        )}
        {report.filters.includes('low') && (
          <label className="flex items-center gap-2 pb-2 text-sm text-slate-600">
            <input type="checkbox" checked={!!filters.low} onChange={set('low')} /> Low stock only
          </label>
        )}
        <Button variant="secondary" className="ml-auto" disabled={!rows?.length} onClick={exportCsv}>
          Export CSV (Excel)
        </Button>
      </div>

      <ErrorBox>{error}</ErrorBox>
      {!rows && !error && <div className="text-slate-500">Loading...</div>}
      {rows && (
        <Table columns={report.columns.map((c) => ({ label: c.label, className: numeric(c) ? 'text-right' : '' }))} empty="No records for these filters">
          {[
            ...rows.map((r, i) => (
              <tr key={i} className="border-t">
                {report.columns.map((c) => (
                  <Td key={c.key} className={numeric(c) ? 'text-right' : ''}>{show(c, r[c.key])}</Td>
                ))}
              </tr>
            )),
            ...(rows.length
              ? [
                  <tr key="total" className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                    {report.columns.map((c, i) => (
                      <Td key={c.key} className={numeric(c) ? 'text-right' : ''}>
                        {i === 0 ? `Total (${rows.length})` : c.key in totals ? show(c, totals[c.key]) : ''}
                      </Td>
                    ))}
                  </tr>,
                ]
              : []),
          ]}
        </Table>
      )}
    </div>
  );
}
