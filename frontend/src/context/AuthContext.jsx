import { createContext, useContext, useEffect, useState } from "react";
import {
  getCurrentUser,
  loginUser,
  registerUser,
  updateUserPreferences,
} from "../services/authService";
import { clearExpenseCache } from "../services/expenseCache";

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
        const data = await getCurrentUser();
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

    const data = hasAccount
      ? await registerUser({
          email,
          password,
          name,
          householdName: "Home",
        })
      : await loginUser({ email, password });
    localStorage.setItem("token", data.token);
    clearExpenseCache().catch(() => {});
    setUser(data.user);
  };

  const refreshUser = async () => {
    const data = await getCurrentUser();
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem("token");
    clearExpenseCache().catch(() => {});
    setUser(null);
  };

  const updatePreferences = async (preferences = {}) => {
    const data = await updateUserPreferences(preferences);
    setUser(data.user);
    return data.user;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        authLoading,
        login,
        logout,
        updatePreferences,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
