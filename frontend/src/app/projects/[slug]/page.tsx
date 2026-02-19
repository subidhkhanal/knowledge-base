"use client";

import { use } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
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

function ArticleContent({ slug }: { slug: string }) {
  const { article, isLoading, error } = useArticle(slug);
  const { createXhr } = useApi();

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

  return (
    <div className="h-screen overflow-y-auto" style={{ background: "var(--bg-primary)" }}>
      <Header onFileUpload={handleFileUpload} />

      <main className="mx-auto max-w-2xl px-6 py-12">
        {/* Back link */}
        <Link
          href="/projects"
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
          Back to Projects
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
                <span
                  className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium"
                  style={{
                    background:
                      article.source === "claude"
                        ? "rgba(217, 119, 6, 0.1)"
                        : "rgba(16, 185, 129, 0.1)",
                    color:
                      article.source === "claude" ? "#f59e0b" : "#10b981",
                  }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{
                      background:
                        article.source === "claude" ? "#f59e0b" : "#10b981",
                    }}
                  />
                  {article.source === "claude" ? "Claude" : "ChatGPT"}
                </span>
                <span
                  className="text-xs"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  {formatDate(article.created_at)}
                </span>
                <span
                  className="text-xs"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  {article.conversation_length} messages
                </span>
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

            {/* Content */}
            <div className="prose-chat">
              <ReactMarkdown>{article.content_markdown}</ReactMarkdown>
            </div>
          </article>
        )}
      </main>
    </div>
  );
}

export default function ArticleSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return <ArticleContent slug={slug} />;
}
