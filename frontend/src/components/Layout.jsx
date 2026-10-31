import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext.jsx';
import ChangePassword from './ChangePassword.jsx';
import { useCompany } from '../context/CompanyContext.jsx';

const MANAGE = ['Admin', 'Manager'];

// roles: who sees the link (omit = everyone)
const links = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/sales', label: 'Sales' },
  { to: '/quotations', label: 'Quotations' },
  { to: '/products', label: 'Products' },
  { to: '/stock', label: 'Stock', badge: 'low' },
  { to: '/purchases', label: 'Purchases' },
  { to: '/suppliers', label: 'Suppliers' },
  { to: '/customers', label: 'Customers' },
  { to: '/masters', label: 'Masters' },
  { to: '/reports', label: 'Reports', roles: MANAGE },
  { to: '/users', label: 'Users', roles: ['Admin'] },
  { to: '/settings', label: 'Company Settings', roles: ['Admin'] },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const company = useCompany();
  const navigate = useNavigate();
  const location = useLocation();
  const [lowCount, setLowCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  // Refresh the low-stock alert count on every page change (stock moves on purchases, sales, adjustments).
  useEffect(() => {
    api.get('/stock/alerts').then((r) => setLowCount(r.data.data.length)).catch(() => {});
    setMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const title = links.find((l) => (l.to === '/' ? location.pathname === '/' : location.pathname.startsWith(l.to)))?.label;

  return (
    <div className="flex min-h-screen">
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-56 flex-col bg-slate-900 text-slate-200 transition-transform md:static md:translate-x-0 ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="break-words px-5 py-4 text-lg font-semibold text-white">{company.company_name}</div>
        <nav className="flex-1 space-y-1 px-2">
          {links
            .filter((l) => !l.roles || l.roles.includes(user.role))
            .map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.to === '/'}
                className={({ isActive }) =>
                  `flex items-center justify-between rounded px-3 py-2 text-sm ${isActive ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800'}`
                }
              >
                {l.label}
                {l.badge === 'low' && lowCount > 0 && (
                  <span className="rounded-full bg-red-500 px-2 text-xs font-semibold text-white" title="Products at or below minimum stock">
                    {lowCount}
                  </span>
                )}
              </NavLink>
            ))}
        </nav>
      </aside>
      {menuOpen && <div className="fixed inset-0 z-20 bg-black/40 md:hidden" onClick={() => setMenuOpen(false)} />}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 bg-white px-4 py-3 shadow-sm md:px-6">
          <div className="flex items-center gap-3">
            <button onClick={() => setMenuOpen(true)} className="text-xl text-slate-600 md:hidden" aria-label="Open menu">☰</button>
            <h1 className="font-semibold text-slate-800">{title}</h1>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="hidden text-slate-500 sm:inline">
              {user.name} · {user.role}
            </span>
            <button onClick={() => setChangingPassword(true)} className="text-slate-600 hover:underline">
              Change password
            </button>
            <button onClick={handleLogout} className="text-indigo-600 hover:underline">
              Logout
            </button>
          </div>
        </header>
        <main className="p-4 md:p-6">
          <Outlet />
        </main>
      </div>

      {changingPassword && <ChangePassword onClose={() => setChangingPassword(false)} />}
    </div>
  );
}
