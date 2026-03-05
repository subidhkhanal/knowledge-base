"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  username: string | null;
  isLoggedIn: boolean;
  isLoading: boolean;
  login: (token: string, username: string, refreshToken: string) => void;
  logout: () => void;
  updateToken: (newToken: string) => void;
}

const AuthContext = createContext<AuthState | null>(null);

const STORAGE_KEYS = {
  token: "kb_auth_token",
  refreshToken: "kb_refresh_token",
  username: "kb_username",
} as const;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load from localStorage on mount
  useEffect(() => {
    setToken(localStorage.getItem(STORAGE_KEYS.token));
    setRefreshToken(localStorage.getItem(STORAGE_KEYS.refreshToken));
    setUsername(localStorage.getItem(STORAGE_KEYS.username));
    setIsLoading(false);
  }, []);

  const login = useCallback((newToken: string, newUsername: string, newRefreshToken: string) => {
    localStorage.setItem(STORAGE_KEYS.token, newToken);
    localStorage.setItem(STORAGE_KEYS.refreshToken, newRefreshToken);
    localStorage.setItem(STORAGE_KEYS.username, newUsername);
    setToken(newToken);
    setRefreshToken(newRefreshToken);
    setUsername(newUsername);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEYS.token);
    localStorage.removeItem(STORAGE_KEYS.refreshToken);
    localStorage.removeItem(STORAGE_KEYS.username);
    setToken(null);
    setRefreshToken(null);
    setUsername(null);
  }, []);

  const updateToken = useCallback((newToken: string) => {
    localStorage.setItem(STORAGE_KEYS.token, newToken);
    setToken(newToken);
  }, []);

  return (
    <AuthContext value={{
      token,
      refreshToken,
      username,
      isLoggedIn: !!token,
      isLoading,
      login,
      logout,
      updateToken,
    }}>
      {children}
    </AuthContext>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
