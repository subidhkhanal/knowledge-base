"use client";

import { useState, useEffect, useCallback } from "react";
import { useApi } from "./useApi";

export interface DocumentMeta {
  id: number;
  filename: string;
  extension: string;
  size_bytes: number;
  mime_type: string;
  project_id: number | null;
  created_at: string;
}

export function useDocument(id: number) {
  const { apiFetch } = useApi();
  const [document, setDocument] = useState<DocumentMeta | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDocument = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/documents/${id}`);
      if (res.ok) {
        setDocument(await res.json());
      } else if (res.status === 404) {
        setError("Document not found");
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.detail || "Failed to load document");
      }
    } catch {
      setError("Failed to connect to the server");
    } finally {
      setIsLoading(false);
    }
  }, [id, apiFetch]);

  useEffect(() => {
    fetchDocument();
  }, [fetchDocument]);

  return { document, isLoading, error };
}
