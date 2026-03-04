"use client";

import { useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function useApi() {
  const { token, refreshToken, groqApiKey, tavilyApiKey, updateToken, logout } = useAuth();

  // Prevent multiple concurrent refresh attempts
  const isRefreshing = useRef(false);
  const refreshPromise = useRef<Promise<string | null> | null>(null);

  const tryRefresh = useCallback(async (): Promise<string | null> => {
    if (isRefreshing.current) {
      return refreshPromise.current;
    }
    if (!refreshToken) {
      logout();
      return null;
    }
    isRefreshing.current = true;
    refreshPromise.current = (async () => {
      try {
        const res = await fetch(`${API_URL}/api/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
        if (!res.ok) {
          logout();
          return null;
        }
        const data = await res.json();
        updateToken(data.access_token);
        return data.access_token as string;
      } catch {
        logout();
        return null;
      } finally {
        isRefreshing.current = false;
        refreshPromise.current = null;
      }
    })();
    return refreshPromise.current;
  }, [refreshToken, updateToken, logout]);

  const apiFetch = useCallback(
    async (endpoint: string, options: RequestInit = {}): Promise<Response> => {
      const buildHeaders = (currentToken: string | null) => {
        const headers = new Headers(options.headers);
        if (currentToken) headers.set("Authorization", `Bearer ${currentToken}`);
        if (groqApiKey) headers.set("X-Groq-API-Key", groqApiKey);
        if (tavilyApiKey) headers.set("X-Tavily-API-Key", tavilyApiKey);
        return headers;
      };

      const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers: buildHeaders(token),
      });

      if (response.status === 401) {
        const newToken = await tryRefresh();
        if (!newToken) return response; // logout already called
        // Retry with new token
        return fetch(`${API_URL}${endpoint}`, {
          ...options,
          headers: buildHeaders(newToken),
        });
      }

      return response;
    },
    [token, groqApiKey, tavilyApiKey, tryRefresh]
  );

  // Create XMLHttpRequest (for upload progress tracking)
  const createXhr = useCallback(
    (method: string, endpoint: string): XMLHttpRequest => {
      const xhr = new XMLHttpRequest();
      xhr.open(method, `${API_URL}${endpoint}`);
      if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      if (groqApiKey) xhr.setRequestHeader("X-Groq-API-Key", groqApiKey);
      if (tavilyApiKey) xhr.setRequestHeader("X-Tavily-API-Key", tavilyApiKey);
      return xhr;
    },
    [token, groqApiKey, tavilyApiKey]
  );

  return {
    apiFetch,
    createXhr,
  };
}
