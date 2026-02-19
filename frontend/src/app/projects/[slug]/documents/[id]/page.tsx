"use client";

import { use } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Header } from "@/components/Header";
import { useDocument } from "@/hooks/useDocument";

const EbookViewer = dynamic(() => import("@/components/readers/EbookViewer"), { ssr: false });
const PdfViewer = dynamic(() => import("@/components/readers/PdfViewer"), { ssr: false });
const TextViewer = dynamic(() => import("@/components/readers/TextViewer"), { ssr: false });

const EBOOK_EXTENSIONS = [".epub", ".mobi", ".azw", ".azw3", ".fb2", ".cbz"];
const PDF_EXTENSIONS = [".pdf"];
const TEXT_EXTENSIONS = [".txt", ".md", ".markdown", ".html", ".htm", ".docx", ".doc"];

function DocumentReaderContent({ slug, id }: { slug: string; id: number }) {
  const { document, isLoading, error } = useDocument(id);

  const ext = document?.extension || "";
  const isEbook = EBOOK_EXTENSIONS.includes(ext);
  const isPdf = PDF_EXTENSIONS.includes(ext);
  const isText = TEXT_EXTENSIONS.includes(ext);

  return (
    <div className="flex h-screen flex-col" style={{ background: "var(--bg-primary)" }}>
      <Header />

      {/* Top bar with back nav + filename */}
      <div
        className="flex items-center gap-3 px-6 py-3 shrink-0"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <Link
          href={`/projects/${slug}`}
          className="inline-flex items-center gap-1.5 text-sm hover:opacity-70"
          style={{ color: "var(--text-secondary)" }}
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Project
        </Link>
        {document && (
          <>
            <span className="h-4 w-px" style={{ background: "var(--border)" }} />
            <span className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
              {document.filename}
            </span>
          </>
        )}
      </div>

      {/* Viewer area */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {isLoading && (
          <div className="flex items-center justify-center h-full">
            <svg className="h-8 w-8 animate-spin" style={{ color: "var(--accent)" }} viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <svg className="h-12 w-12 mb-3" style={{ color: "var(--text-tertiary)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm mb-1" style={{ color: "var(--text-primary)" }}>{error}</p>
            <Link href={`/projects/${slug}`} className="text-xs underline" style={{ color: "var(--accent)" }}>
              Back to Project
            </Link>
          </div>
        )}

        {document && isEbook && <EbookViewer documentId={id} />}
        {document && isPdf && <PdfViewer documentId={id} />}
        {document && isText && <TextViewer documentId={id} filename={document.filename} />}

        {document && !isEbook && !isPdf && !isText && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <svg className="h-12 w-12 mb-3" style={{ color: "var(--text-tertiary)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
              No viewer available for {ext} files
            </p>
          </div>
        )}
      </div>
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
