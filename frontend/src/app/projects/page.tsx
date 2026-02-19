"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Header } from "@/components/Header";
import { ArticleCard } from "@/components/ArticleCard";
import { useArticles } from "@/hooks/useArticles";
import { useApi } from "@/hooks/useApi";

interface Source {
  source: string;
  source_type: string;
  chunk_count: number;
}

function ProjectsContent() {
  const { articles, isLoading: articlesLoading, error: articlesError, refetch: refetchArticles } = useArticles();
  const { apiFetch, createXhr } = useApi();

  const [documents, setDocuments] = useState<Source[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [deletingDocument, setDeletingDocument] = useState<string | null>(null);

  const fetchDocuments = useCallback(async () => {
    setDocsLoading(true);
    setDocsError(null);

    try {
      const res = await apiFetch("/api/sources");
      if (res.ok) {
        const data = await res.json();
        setDocuments(data);
      } else {
        setDocsError("Failed to load documents");
      }
    } catch {
      setDocsError("Failed to connect to the server");
    } finally {
      setDocsLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const handleDelete = async (documentName: string) => {
    if (!confirm(`Delete "${documentName}"?`)) return;

    setDeletingDocument(documentName);

    try {
      const response = await apiFetch(
        `/api/sources/${encodeURIComponent(documentName)}`,
        { method: "DELETE" }
      );

      if (response.ok) {
        await fetchDocuments();
      } else {
        const data = await response.json();
        alert(data.detail || "Failed to delete");
      }
    } catch {
      alert("Failed to connect");
    } finally {
      setDeletingDocument(null);
    }
  };

  const handleFileUpload = (file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    const xhr = createXhr("POST", "/api/upload/document");

    xhr.addEventListener("load", () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          fetchDocuments();
        } else {
          alert(data.detail || "Upload failed");
        }
      } catch {
        alert("Upload failed: invalid response");
      }
    });

    xhr.addEventListener("error", () => {
      alert("Upload failed: could not connect to server");
    });

    xhr.send(formData);
  };

  const handleRefreshAll = () => {
    refetchArticles();
    fetchDocuments();
  };

  const isLoading = articlesLoading && docsLoading;

  return (
    <div className="h-screen overflow-y-auto" style={{ background: "var(--bg-primary)" }}>
      <Header onFileUpload={handleFileUpload} />

      <main className="mx-auto max-w-4xl px-6 py-12">
        {/* Page header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1
              className="text-2xl font-semibold tracking-tight"
              style={{ color: "var(--text-primary)" }}
            >
              Projects
            </h1>
            {!isLoading && (
              <p
                className="mt-1 text-sm"
                style={{ color: "var(--text-tertiary)" }}
              >
                {articles.length} {articles.length === 1 ? "article" : "articles"} · {documents.length} {documents.length === 1 ? "document" : "documents"}
              </p>
            )}
          </div>
          <button
            onClick={handleRefreshAll}
            className="flex h-9 w-9 items-center justify-center rounded-lg cursor-pointer hover:bg-bg-hover"
            style={{
              background: "var(--bg-secondary)",
              border: "1px solid var(--border)",
            }}
          >
            <svg
              className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
              style={{ color: "var(--text-secondary)" }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </div>

        {/* Global loading */}
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

        {/* ─── Articles Section ─── */}
        {!articlesLoading && (
          <section className="mb-12">
            <h2
              className="mb-4 text-sm font-semibold uppercase tracking-wider"
              style={{ color: "var(--text-tertiary)" }}
            >
              Articles
            </h2>

            {articlesError && (
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
                  {articlesError}
                </p>
              </div>
            )}

            {!articlesError && articles.length === 0 && (
              <div
                className="flex flex-col items-center justify-center rounded-xl py-12 text-center"
                style={{
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border)",
                  boxShadow: "var(--shadow-card)",
                }}
              >
                <div
                  className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl"
                  style={{
                    background: "var(--accent-subtle)",
                    border: "1px solid var(--border-accent)",
                  }}
                >
                  <svg
                    className="h-6 w-6"
                    style={{ color: "var(--accent)" }}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                    />
                  </svg>
                </div>
                <p
                  className="mb-1 text-sm font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  No articles yet
                </p>
                <p
                  className="text-xs"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  Publish conversations from the Chat to Webpage extension
                </p>
              </div>
            )}

            {!articlesError && articles.length > 0 && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {articles.map((article, index) => (
                  <ArticleCard key={article.slug} {...article} index={index} />
                ))}
              </div>
            )}
          </section>
        )}

        {/* ─── Documents Section ─── */}
        {!docsLoading && (
          <section>
            <h2
              className="mb-4 text-sm font-semibold uppercase tracking-wider"
              style={{ color: "var(--text-tertiary)" }}
            >
              Documents
            </h2>

            {docsError && (
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
                  {docsError}
                </p>
              </div>
            )}

            {!docsError && documents.length === 0 && (
              <div
                className="flex flex-col items-center justify-center rounded-xl py-12 text-center"
                style={{
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border)",
                  boxShadow: "var(--shadow-card)",
                }}
              >
                <div
                  className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl"
                  style={{
                    background: "var(--accent-subtle)",
                    border: "1px solid var(--border-accent)",
                  }}
                >
                  <svg
                    className="h-6 w-6"
                    style={{ color: "var(--accent)" }}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                    />
                  </svg>
                </div>
                <p
                  className="mb-1 text-sm font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  No documents yet
                </p>
                <p
                  className="text-xs"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  Upload content from the main page
                </p>
              </div>
            )}

            {!docsError && documents.length > 0 && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {documents.map((document, index) => (
                  <motion.div
                    key={document.source}
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.6,
                      ease: [0.16, 1, 0.3, 1],
                      delay: index * 0.05,
                    }}
                    className="group relative flex flex-col gap-3 rounded-xl p-4"
                    style={{
                      background: "var(--bg-secondary)",
                      border: "1px solid var(--border)",
                      boxShadow: "var(--shadow-card)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "var(--border-hover)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "var(--border)";
                    }}
                  >
                    {/* Type badge */}
                    <div className="flex items-center justify-between">
                      <span
                        className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium"
                        style={{
                          background:
                            document.source_type === "pdf"
                              ? "rgba(239, 68, 68, 0.1)"
                              : "rgba(59, 130, 246, 0.1)",
                          color: document.source_type === "pdf" ? "#ef4444" : "#3b82f6",
                        }}
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{
                            background: document.source_type === "pdf" ? "#ef4444" : "#3b82f6",
                          }}
                        />
                        {document.source_type === "pdf" ? "PDF" : "Document"}
                      </span>
                      <button
                        onClick={() => handleDelete(document.source)}
                        disabled={deletingDocument === document.source}
                        className="flex h-7 w-7 items-center justify-center rounded-lg opacity-0 transition-all group-hover:opacity-100 disabled:opacity-50 cursor-pointer"
                        style={{ color: "var(--text-tertiary)" }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = "var(--error)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = "var(--text-tertiary)";
                        }}
                      >
                        {deletingDocument === document.source ? (
                          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        ) : (
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        )}
                      </button>
                    </div>

                    {/* Title */}
                    <h3
                      className="text-sm font-medium leading-snug line-clamp-2"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {document.source}
                    </h3>

                    {/* Meta row */}
                    <div
                      className="flex items-center gap-3 text-xs"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      <span>{document.chunk_count} {document.chunk_count === 1 ? "chunk" : "chunks"}</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

export default function ProjectsPage() {
  return <ProjectsContent />;
}
