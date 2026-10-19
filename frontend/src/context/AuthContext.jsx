import { createContext, useContext, useEffect, useState } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('user'));
    } catch {
      return null;
    }
  });

  // Pick up role changes made by an admin since this user signed in.
  useEffect(() => {
    if (!localStorage.getItem('token')) return;
    api.get('/me').then(({ data }) => {
      setUser((u) => {
        if (!u || u.role === data.data.role) return u;
        const next = { ...u, role: data.data.role };
        localStorage.setItem('user', JSON.stringify(next));
        return next;
      });
    }).catch(() => {});
  }, []);

  const login = async (email, password) => {
    const { data } = await api.post('/login', { email, password });
    localStorage.setItem('token', data.data.token);
    localStorage.setItem('user', JSON.stringify(data.data.user));
    setUser(data.data.user);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
