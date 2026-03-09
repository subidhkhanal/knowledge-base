"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";

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
  const { data, error, isLoading } = useSWR<DocumentMeta>(
    `/api/documents/${id}`,
    fetcher,
  );

  return {
    document: data ?? null,
    isLoading,
    error: error ? "Failed to connect to the server" : null,
  };
}
