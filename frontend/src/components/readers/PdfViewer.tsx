"use client";

import { useEffect, useState } from "react";
import { useApi } from "@/hooks/useApi";

interface PdfViewerProps {
  documentId: number;
}

export default function PdfViewer({ documentId }: PdfViewerProps) {
  const { apiFetch } = useApi();
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;

    async function load() {
      try {
        const res = await apiFetch(`/api/documents/${documentId}/file`);
        if (!res.ok) {
          if (!cancelled) setError("Failed to load PDF");
          return;
        }
        const blob = await res.blob();
        if (!cancelled) {
          url = URL.createObjectURL(blob);
          setBlobUrl(url);
        }
      } catch {
        if (!cancelled) setError("Failed to connect to server");
      }
    }

    load();

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [documentId, apiFetch]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm" style={{ color: "var(--error)" }}>{error}</p>
      </div>
    );
  }

  if (!blobUrl) {
    return (
      <div className="flex items-center justify-center h-full">
        <svg className="h-8 w-8 animate-spin" style={{ color: "var(--accent)" }} viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  return <iframe src={blobUrl} className="h-full w-full border-0" title="PDF Viewer" />;
}
