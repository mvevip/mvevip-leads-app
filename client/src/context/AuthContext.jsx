import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('mvevip_user');
      if (!saved) return null;
      const parsed = JSON.parse(saved);
      if (parsed?.avatarUrl && (parsed.avatarUrl.includes('unsplash') || parsed.avatarUrl.includes('placeholder'))) {
        parsed.avatarUrl = null;
        localStorage.setItem('mvevip_user', JSON.stringify(parsed));
      }
      return parsed;
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState(() => localStorage.getItem('mvevip_token'));
  const [loading, setLoading] = useState(false);

  // Sincronizar perfil fresco del servidor
  useEffect(() => {
    if (token) {
      api.get('/auth/profile')
        .then(res => {
          if (res.data?.user) {
            const fresh = res.data.user;
            if (fresh.avatarUrl && (fresh.avatarUrl.includes('unsplash') || fresh.avatarUrl.includes('placeholder'))) {
              fresh.avatarUrl = null;
            }
            setUser(fresh);
            localStorage.setItem('mvevip_user', JSON.stringify(fresh));
          }
        })
        .catch(() => {});
    }
  }, [token]);

  useEffect(() => {
    const handleExpired = () => {
      setUser(null);
      setToken(null);
    };
    window.addEventListener('auth:expired', handleExpired);
    return () => window.removeEventListener('auth:expired', handleExpired);
  }, []);

  const login = async (email, password) => {
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { email, password });
      const { token: jwtToken, user: userData } = res.data;

      localStorage.setItem('mvevip_token', jwtToken);
      localStorage.setItem('mvevip_user', JSON.stringify(userData));

      setToken(jwtToken);
      setUser(userData);
      return { success: true, user: userData };
    } catch (err) {
      const msg = err.response?.data?.error || 'Error al iniciar sesión';
      return { success: false, error: msg };
    } finally {
      setLoading(false);
    }
  };

  const updateCurrentUser = (updatedFields) => {
    const merged = { ...user, ...updatedFields };
    localStorage.setItem('mvevip_user', JSON.stringify(merged));
    setUser(merged);
  };

  const logout = () => {
    localStorage.removeItem('mvevip_token');
    localStorage.removeItem('mvevip_user');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{
      user,
      token,
      login,
      logout,
      updateCurrentUser,
      loading,
      isAdmin: user?.role === 'ADMIN',
      mustChangePassword: Boolean(user?.mustChangePassword),
      isFirstLogin: Boolean(user?.isFirstLogin)
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
