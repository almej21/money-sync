import { createContext, useContext, useEffect, useState } from "react";
import { api } from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function hydrateAuth() {
      const token = localStorage.getItem("token");
      if (!token) {
        if (!cancelled) setAuthLoading(false);
        return;
      }

      try {
        const data = await api("/auth/me");
        if (!cancelled) setUser(data.user);
      } catch {
        localStorage.removeItem("token");
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    }

    hydrateAuth();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = async (email, password, name) => {
    const hasAccount = !!name;
    const path = hasAccount ? "/auth/register" : "/auth/login";
    const body = hasAccount
      ? { email, password, name, householdName: "Home" }
      : { email, password };

    const data = await api(path, {
      method: "POST",
      body: JSON.stringify(body),
    });
    localStorage.setItem("token", data.token);
    setUser(data.user);
  };

  const logout = () => {
    localStorage.removeItem("token");
    setUser(null);
  };

  const updatePreferences = async (preferences = {}) => {
    const data = await api("/auth/preferences", {
      method: "PUT",
      body: JSON.stringify(preferences),
    });
    setUser(data.user);
    return data.user;
  };

  return (
    <AuthContext.Provider
      value={{ user, authLoading, login, logout, updatePreferences }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
