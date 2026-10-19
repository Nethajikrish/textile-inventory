import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import api from '../services/api';

// Company details (Admin → Company Settings), used for the app name and on printed invoices.
const DEFAULTS = {
  company_name: 'Textile Inventory', building_no: '', street: '', city: '', district: '', state: '', pincode: '', phone: '', email: '', gstin: '', barcode_prefix: '',
};

const CompanyContext = createContext({ company: DEFAULTS, setCompany: () => {} });

export function CompanyProvider({ children }) {
  const [company, setCompany] = useState(DEFAULTS);

  const load = useCallback(() => {
    api.get('/settings').then((r) => setCompany({ ...DEFAULTS, ...r.data.data })).catch(() => {});
  }, []);
  useEffect(load, [load]);

  useEffect(() => { document.title = company.company_name; }, [company.company_name]);

  return <CompanyContext.Provider value={{ company, setCompany }}>{children}</CompanyContext.Provider>;
}

export const useCompany = () => useContext(CompanyContext).company;
export const useSetCompany = () => useContext(CompanyContext).setCompany;

// Address as printable lines, e.g.
// "No. 1 133, Chennai to Kumbookonam main road" / "Panayapuram, Viluppuram District" / "Tamil Nadu - 605601"
export function addressLines(c) {
  return [
    [c.building_no && `No. ${c.building_no}`, c.street].filter(Boolean).join(', '),
    [c.city, c.district && `${c.district} District`].filter(Boolean).join(', '),
    [c.state, c.pincode].filter(Boolean).join(' - '),
  ].filter(Boolean);
}
