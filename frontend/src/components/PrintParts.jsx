import { addressLines, useCompany } from '../context/CompanyContext.jsx';

// Shared pieces of the printable sales bill and purchase bill.

export function CompanyBlock() {
  const company = useCompany();
  return (
    <div>
      <div className="text-xl font-bold">{company.company_name}</div>
      {addressLines(company).map((l) => <div key={l} className="text-slate-600">{l}</div>)}
      {company.phone && <div className="text-slate-600">Phone: {company.phone}</div>}
      {company.email && <div className="text-slate-600">{company.email}</div>}
      {company.gstin && <div className="font-medium">GSTIN: {company.gstin}</div>}
    </div>
  );
}

export function PartyBlock({ title, name, address, phone, gstin }) {
  return (
    <div className="border-b py-4">
      <div className="text-xs uppercase text-slate-500">{title}</div>
      <div className="font-semibold">{name}</div>
      {address && <div className="whitespace-pre-line text-slate-600">{address}</div>}
      {phone && <div className="text-slate-600">Phone: {phone}</div>}
      {gstin && <div className="font-medium">GSTIN: {gstin}</div>}
    </div>
  );
}

export function TotalLine({ label, value, bold }) {
  return (
    <div className={`flex justify-between ${bold ? 'border-t pt-1 text-base font-semibold' : ''}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export function Stamp({ children }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <span className="-rotate-12 rounded border-4 border-red-400 px-6 py-2 text-5xl font-bold uppercase text-red-400 opacity-60">{children}</span>
    </div>
  );
}
