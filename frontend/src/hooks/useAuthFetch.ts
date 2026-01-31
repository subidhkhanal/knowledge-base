"use client";

import { useSession } from "next-auth/react";
import { useCallback } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function useAuthFetch() {
  const { data: session } = useSession();

  const authFetch = useCallback(
    async (endpoint: string, options: RequestInit = {}) => {
      const headers = new Headers(options.headers);

      // Send user ID in custom header for backend identification
      if (session?.userId) {
        headers.set("X-User-Id", session.userId);
      }

      return fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers,
      });
    },
    [session?.userId]
  );

  // Create XMLHttpRequest with auth header (for upload progress tracking)
  const createAuthXhr = useCallback(
    (method: string, endpoint: string): XMLHttpRequest => {
      const xhr = new XMLHttpRequest();
      xhr.open(method, `${API_URL}${endpoint}`);

      if (session?.userId) {
        xhr.setRequestHeader("X-User-Id", session.userId);
      }

      return xhr;
    },
    [session?.userId]
  );

  return {
    authFetch,
    createAuthXhr,
    isAuthenticated: !!session,
    userId: session?.userId
  };
}
