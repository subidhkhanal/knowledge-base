"use client";

import { use, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/Header";
import { useArticle } from "@/hooks/useArticles";
import { useApi } from "@/hooks/useApi";

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

const sourceConfig: Record<string, { label: string; color: string; bg: string }> = {
  claude: { label: "Claude", color: "#f59e0b", bg: "rgba(217, 119, 6, 0.1)" },
  chatgpt: { label: "ChatGPT", color: "#10b981", bg: "rgba(16, 185, 129, 0.1)" },
  web: { label: "Web", color: "#3b82f6", bg: "rgba(59, 130, 246, 0.1)" },
  paste: { label: "Pasted", color: "#8b5cf6", bg: "rgba(139, 92, 246, 0.1)" },
};

function getSourceInfo(source: string) {
  return sourceConfig[source] || { label: source, color: "#64748b", bg: "rgba(100, 116, 139, 0.1)" };
}

function ArticleReaderContent({
  projectSlug,
  articleSlug,
}: {
  projectSlug: string;
  articleSlug: string;
}) {
  const { article, isLoading, error, refetch } = useArticle(articleSlug);
  const { apiFetch, createXhr } = useApi();
  const [isReprocessing, setIsReprocessing] = useState(false);

  const handleFileUpload = (file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    const xhr = createXhr("POST", "/api/upload/document");

    xhr.addEventListener("load", () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          alert("Upload complete: document added to knowledge base");
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

  const handleReprocess = async () => {
    if (!article || isReprocessing) return;
    setIsReprocessing(true);
    try {
      const res = await apiFetch(`/api/articles/${encodeURIComponent(articleSlug)}/reprocess`, {
        method: "POST",
      });
      if (res.ok) {
        refetch();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.detail || "Failed to regenerate layout");
      }
    } catch {
      alert("Failed to connect to the server");
    } finally {
      setIsReprocessing(false);
    }
  };

  return (
    <div
      className="h-screen overflow-y-auto"
      style={{ background: "var(--bg-primary)" }}
    >
      <Header onFileUpload={handleFileUpload} />

      <main className="mx-auto max-w-2xl px-6 py-12">
        {/* Back link */}
        <Link
          href={`/projects/${projectSlug}`}
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

        {/* Article */}
        {article && (
          <article>
            {/* Header */}
            <header className="mb-8">
              <div className="mb-3 flex items-center gap-3">
                {(() => {
                  const src = getSourceInfo(article.source);
                  return (
                    <span
                      className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium"
                      style={{ background: src.bg, color: src.color }}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: src.color }}
                      />
                      {src.label}
                    </span>
                  );
                })()}
                <span
                  className="text-xs"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  {formatDate(article.created_at)}
                </span>
                {article.conversation_length > 0 && (
                  <span
                    className="text-xs"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    {article.conversation_length} messages
                  </span>
                )}
              </div>

              <h1
                className="text-2xl font-semibold tracking-tight leading-tight"
                style={{ color: "var(--text-primary)" }}
              >
                {article.title}
              </h1>

              {article.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {article.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-md px-2 py-0.5 text-xs"
                      style={{
                        background: "var(--accent-subtle)",
                        color: "var(--accent)",
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </header>

            {/* Divider */}
            <hr
              className="mb-8"
              style={{ border: "none", borderTop: "1px solid var(--border)" }}
            />

            {/* Regenerate button for articles without HTML */}
            {!article.content_html && (
              <div className="mb-8">
                <button
                  onClick={handleReprocess}
                  disabled={isReprocessing}
                  className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium cursor-pointer"
                  style={{
                    background: "var(--accent-subtle)",
                    color: "var(--accent)",
                    border: "1px solid var(--border-accent)",
                    opacity: isReprocessing ? 0.6 : 1,
                  }}
                >
                  {isReprocessing ? (
                    <>
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Generating layout...
                    </>
                  ) : (
                    <>
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Regenerate Layout
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Content */}
            <div
              className="article-html"
              dangerouslySetInnerHTML={{
                __html: article.content_html || article.content_markdown,
              }}
            />
          </article>
        )}
      </main>
    </div>
  );
}

export default function ArticleReaderPage({
  params,
}: {
  params: Promise<{ slug: string; articleSlug: string }>;
}) {
  const { slug, articleSlug } = use(params);
  return <ArticleReaderContent projectSlug={slug} articleSlug={articleSlug} />;
}
