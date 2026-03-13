"use client";

import { use } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Header } from "@/components/Header";
import { useDocument } from "@/hooks/useDocument";

const EbookViewer = dynamic(() => import("@/components/readers/EbookViewer"), { ssr: false });

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function DocumentReaderContent({ slug, id }: { slug: string; id: number }) {
  const { document, isLoading, error } = useDocument(id);

  return (
    <div
      className="h-screen overflow-y-auto"
      style={{ background: "var(--bg-primary)" }}
    >
      <Header />

      <main className="mx-auto max-w-2xl px-6 py-12">
        {/* Back link */}
        <Link
          href={`/projects/${slug}`}
          className="mb-8 inline-flex items-center gap-1.5 text-sm"
          style={{ color: "var(--text-secondary)" }}
        >
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back to Project
        </Link>

        {/* Loading */}
        {isLoading && (
          <div className="flex justify-center py-16">
            <svg
              className="h-6 w-6 animate-spin"
              style={{ color: "var(--accent)" }}
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="3"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          </div>
        )}

        {/* Error */}
        {error && (
          <div
            className="flex items-center gap-3 rounded-xl p-4"
            style={{ background: "var(--error-bg)" }}
          >
            <svg
              className="h-5 w-5"
              style={{ color: "var(--error)" }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-sm" style={{ color: "var(--error)" }}>
              {error}
            </p>
          </div>
        )}

        {/* Document */}
        {document && (
          <article>
            {/* Header */}
            <header className="mb-8">
              <span
                className="text-xs"
                style={{ color: "var(--text-tertiary)" }}
              >
                {formatDate(document.created_at)}
              </span>

              <h1
                className="mt-2 text-2xl font-semibold tracking-tight leading-tight"
                style={{ color: "var(--text-primary)" }}
              >
                {document.filename}
              </h1>
            </header>

            {/* Divider */}
            <hr
              className="mb-8"
              style={{ border: "none", borderTop: "1px solid var(--border)" }}
            />

            {/* EPUB Viewer */}
            <div
              className="h-[70vh] rounded-xl overflow-hidden"
              style={{ border: "1px solid var(--border)" }}
            >
              <EbookViewer documentId={id} />
            </div>
          </article>
        )}
      </main>
    </div>
  );
}

export default function DocumentReaderPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = use(params);
  return <DocumentReaderContent slug={slug} id={parseInt(id, 10)} />;
}
