"use client";

import { useEffect, useRef, useState } from "react";
import { useApi } from "@/hooks/useApi";

interface EbookViewerProps {
  documentId: number;
}

export default function EbookViewer({ documentId }: EbookViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLElement | null>(null);
  const { apiFetch } = useApi();
  const [isReady, setIsReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        // Dynamically import foliate-js (registers the <foliate-view> custom element)
        await import("foliate-js/view.js");

        if (cancelled || !containerRef.current) return;

        // Fetch the file as ArrayBuffer using authenticated apiFetch
        const response = await apiFetch(`/api/documents/${documentId}/file`);
        if (!response.ok) {
          setLoadError("Failed to load file");
          return;
        }
        const arrayBuffer = await response.arrayBuffer();

        if (cancelled || !containerRef.current) return;

        // Create the custom element
        const view = document.createElement("foliate-view");
        containerRef.current.innerHTML = "";
        containerRef.current.appendChild(view);
        viewRef.current = view;

        // Open the book by passing a Blob (which has arrayBuffer())
        const blob = new Blob([arrayBuffer]);
        await (view as any).open(blob);
        if (!cancelled) setIsReady(true);
      } catch {
        if (!cancelled) setLoadError("Failed to open ebook. The file may be corrupted or unsupported.");
      }
    }

    init();

    return () => {
      cancelled = true;
      if (viewRef.current) {
        viewRef.current.remove();
        viewRef.current = null;
      }
    };
  }, [documentId, apiFetch]);

  return (
    <div className="h-full w-full relative">
      {loadError && (
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <svg className="h-12 w-12 mx-auto mb-3" style={{ color: "var(--text-tertiary)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm" style={{ color: "var(--error)" }}>{loadError}</p>
          </div>
        </div>
      )}
      {!loadError && !isReady && (
        <div className="flex items-center justify-center h-full">
          <svg className="h-8 w-8 animate-spin" style={{ color: "var(--accent)" }} viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      )}
      <div
        ref={containerRef}
        className="h-full w-full"
        style={{ colorScheme: "light" }}
      />
      {isReady && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
          <button
            onClick={() => (viewRef.current as any)?.goLeft?.()}
            className="rounded-lg px-4 py-2 text-sm cursor-pointer hover:opacity-80"
            style={{
              background: "var(--bg-secondary)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
              boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
            }}
          >
            Previous
          </button>
          <button
            onClick={() => (viewRef.current as any)?.goRight?.()}
            className="rounded-lg px-4 py-2 text-sm cursor-pointer hover:opacity-80"
            style={{
              background: "var(--bg-secondary)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
              boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
            }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
