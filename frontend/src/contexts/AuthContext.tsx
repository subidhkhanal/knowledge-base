"use client";

import { createContext, useContext, type ReactNode } from "react";

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const value: AuthState = {
    token: null,
    refreshToken: null,
    username: "demo",
    isLoggedIn: true,
    isLoading: false,
    login: () => {},
    logout: () => {},
    updateToken: () => {},
  };

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
