"use client";

import { useCallback } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function useAuthFetch() {
  const authFetch = useCallback(
    async (endpoint: string, options: RequestInit = {}) => {
      return fetch(`${API_URL}${endpoint}`, options);
    },
    []
  );

  // Create XMLHttpRequest (for upload progress tracking)
  const createAuthXhr = useCallback(
    (method: string, endpoint: string): XMLHttpRequest => {
      const xhr = new XMLHttpRequest();
      xhr.open(method, `${API_URL}${endpoint}`);
      return xhr;
    },
    []
  );

  return {
    authFetch,
    createAuthXhr,
  };
}
