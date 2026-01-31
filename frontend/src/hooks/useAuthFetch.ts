"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useCallback } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function useAuthFetch() {
  const { user } = useAuth();

  const authFetch = useCallback(
    async (endpoint: string, options: RequestInit = {}) => {
      const headers = new Headers(options.headers);

      // Send user ID in custom header for backend identification
      if (user?.id) {
        headers.set("X-User-Id", user.id);
      }

      return fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers,
      });
    },
    [user?.id]
  );

  // Create XMLHttpRequest with auth header (for upload progress tracking)
  const createAuthXhr = useCallback(
    (method: string, endpoint: string): XMLHttpRequest => {
      const xhr = new XMLHttpRequest();
      xhr.open(method, `${API_URL}${endpoint}`);

      if (user?.id) {
        xhr.setRequestHeader("X-User-Id", user.id);
      }

      return xhr;
    },
    [user?.id]
  );

  return {
    authFetch,
    createAuthXhr,
    isAuthenticated: !!user,
    userId: user?.id
  };
}
