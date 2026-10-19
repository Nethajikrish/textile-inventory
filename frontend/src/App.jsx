import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Products from './pages/Products.jsx';
import Stock from './pages/Stock.jsx';
import Purchases from './pages/Purchases.jsx';
import Sales from './pages/Sales.jsx';
import InvoicePrint from './pages/InvoicePrint.jsx';
import Parties from './pages/Parties.jsx';
import Masters from './pages/Masters.jsx';
import Reports from './pages/Reports.jsx';
import Users from './pages/Users.jsx';
import Settings from './pages/Settings.jsx';
import PurchasePrint from './pages/PurchasePrint.jsx';
import Labels from './pages/Labels.jsx';

const MANAGE = ['Admin', 'Manager'];

function Protected({ children, roles }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      {/* Full-page invoice for printing, outside the sidebar layout */}
      <Route path="/sales/:id/print" element={<Protected><InvoicePrint /></Protected>} />
      <Route path="/purchases/:id/print" element={<Protected><PurchasePrint /></Protected>} />
      <Route path="/labels" element={<Protected><Labels /></Protected>} />
      <Route
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/products" element={<Products />} />
        <Route path="/stock" element={<Stock />} />
        <Route path="/purchases" element={<Purchases />} />
        <Route path="/sales" element={<Sales />} />
        <Route path="/suppliers" element={<Parties key="suppliers" resource="suppliers" />} />
        <Route path="/customers" element={<Parties key="customers" resource="customers" />} />
        <Route path="/masters" element={<Masters />} />
        <Route path="/reports" element={<Protected roles={MANAGE}><Reports /></Protected>} />
        <Route path="/users" element={<Protected roles={['Admin']}><Users /></Protected>} />
        <Route path="/settings" element={<Protected roles={['Admin']}><Settings /></Protected>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
