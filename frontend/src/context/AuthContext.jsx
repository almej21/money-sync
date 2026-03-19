import { createContext, useContext, useEffect, useState } from "react";
import { api } from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      api("/auth/me")
        .then((data) => setUser(data.user))
        .catch(() => {
          localStorage.removeItem("token");
          setUser(null);
        });
    }
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

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
