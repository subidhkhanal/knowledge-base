"use client";

import { useCallback } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function useApi() {
  const apiFetch = useCallback(
    async (endpoint: string, options: RequestInit = {}) => {
      return fetch(`${API_URL}${endpoint}`, options);
    },
    []
  );

  // Create XMLHttpRequest (for upload progress tracking)
  const createXhr = useCallback(
    (method: string, endpoint: string): XMLHttpRequest => {
      const xhr = new XMLHttpRequest();
      xhr.open(method, `${API_URL}${endpoint}`);
      return xhr;
    },
    []
  );

  return {
    apiFetch,
    createXhr,
  };
}
