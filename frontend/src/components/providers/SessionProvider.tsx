"use client";

import { AuthProvider } from "@/contexts/AuthContext";
import { ReactNode } from "react";

export function SessionProvider({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
