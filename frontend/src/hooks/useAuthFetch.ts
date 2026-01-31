"use client";

import { useSession } from "next-auth/react";
import { useCallback } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function useAuthFetch() {
  const { data: session } = useSession();

  const authFetch = useCallback(
    async (endpoint: string, options: RequestInit = {}) => {
      const headers = new Headers(options.headers);

      if (session?.idToken) {
        headers.set("Authorization", `Bearer ${session.idToken}`);
      }

      // Ensure credentials are included for CORS
      return fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers,
        credentials: "include",
      });
    },
    [session?.idToken]
  );

  // Create XMLHttpRequest with auth header (for upload progress tracking)
  const createAuthXhr = useCallback(
    (method: string, endpoint: string): XMLHttpRequest => {
      const xhr = new XMLHttpRequest();
      xhr.open(method, `${API_URL}${endpoint}`);

      if (session?.idToken) {
        xhr.setRequestHeader("Authorization", `Bearer ${session.idToken}`);
      }

      return xhr;
    },
    [session?.idToken]
  );

  return {
    authFetch,
    createAuthXhr,
    isAuthenticated: !!session,
    idToken: session?.idToken
  };
}
