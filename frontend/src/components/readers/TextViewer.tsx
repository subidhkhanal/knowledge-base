"use client";

import { useEffect, useState } from "react";
import { useApi } from "@/hooks/useApi";

interface TextViewerProps {
  documentId: number;
  filename: string;
}

export default function TextViewer({ documentId, filename }: TextViewerProps) {
  const { apiFetch } = useApi();
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isHtml = filename.endsWith(".html") || filename.endsWith(".htm");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await apiFetch(`/api/documents/${documentId}/file`);
        if (!res.ok) {
          if (!cancelled) setError("Failed to load file");
          return;
        }
        const text = await res.text();
        if (!cancelled) setContent(text);
      } catch {
        if (!cancelled) setError("Failed to connect to server");
      }
    }

    load();
    return () => { cancelled = true; };
  }, [documentId, apiFetch]);

  if (error) {
    return (
      <div className="flex justify-center py-16">
        <p className="text-sm" style={{ color: "var(--error)" }}>{error}</p>
      </div>
    );
  }

  if (content === null) {
    return (
      <div className="flex justify-center py-16">
        <svg className="h-6 w-6 animate-spin" style={{ color: "var(--accent)" }} viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  return isHtml ? (
    <div
      className="prose-chat text-sm leading-relaxed"
      style={{ color: "var(--text-primary)" }}
      dangerouslySetInnerHTML={{ __html: content }}
    />
  ) : (
    <pre
      className="whitespace-pre-wrap text-sm leading-relaxed"
      style={{ color: "var(--text-primary)", fontFamily: "inherit" }}
    >
      {content}
    </pre>
  );
}
