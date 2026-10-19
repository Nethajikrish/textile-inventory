import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useCompany } from '../context/CompanyContext.jsx';

export default function Login() {
  const { user, login } = useAuth();
  const company = useCompany();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to reach the server');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center">
      <form onSubmit={submit} className="w-full max-w-sm bg-white p-8 rounded-lg shadow space-y-4">
        <div>
          <div className="text-sm font-medium text-indigo-600">{company.company_name}</div>
          <h1 className="text-xl font-semibold text-slate-800">Sign in</h1>
        </div>
        {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          required
        />
        <button
          disabled={loading}
          className="w-full rounded bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
