"use client";

import { useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function useApi() {
  const { token, groqApiKey, tavilyApiKey } = useAuth();

  const apiFetch = useCallback(
    async (endpoint: string, options: RequestInit = {}) => {
      const headers = new Headers(options.headers);
      if (token) headers.set("Authorization", `Bearer ${token}`);
      if (groqApiKey) headers.set("X-Groq-API-Key", groqApiKey);
      if (tavilyApiKey) headers.set("X-Tavily-API-Key", tavilyApiKey);
      return fetch(`${API_URL}${endpoint}`, { ...options, headers });
    },
    [token, groqApiKey, tavilyApiKey]
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
