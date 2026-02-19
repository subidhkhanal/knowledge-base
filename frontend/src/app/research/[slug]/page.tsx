"use client";

import { use } from "react";
import Link from "next/link";
import { Header } from "@/components/Header";
import { TableOfContents } from "@/components/TableOfContents";
import { useArticle } from "@/hooks/useArticles";

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function estimateReadingTime(text: string): string {
  const words = text.replace(/<[^>]*>/g, "").split(/\s+/).length;
  const minutes = Math.ceil(words / 200);
  return `${minutes} min read`;
}

const sourceConfig: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  claude: { label: "Claude", color: "#f59e0b", bg: "rgba(217, 119, 6, 0.1)" },
  chatgpt: {
    label: "ChatGPT",
    color: "#10b981",
    bg: "rgba(16, 185, 129, 0.1)",
  },
  web: { label: "Web", color: "#3b82f6", bg: "rgba(59, 130, 246, 0.1)" },
  paste: { label: "Pasted", color: "#8b5cf6", bg: "rgba(139, 92, 246, 0.1)" },
  research: {
    label: "Research",
    color: "#6366f1",
    bg: "rgba(99, 102, 241, 0.1)",
  },
};

function getSourceInfo(source: string) {
  return (
    sourceConfig[source] || {
      label: source,
      color: "#64748b",
      bg: "rgba(100, 116, 139, 0.1)",
    }
  );
}

function ResearchArticleContent({ slug }: { slug: string }) {
  const { article, isLoading, error } = useArticle(slug);

  const readingTime = article
    ? estimateReadingTime(article.content_html || article.content_markdown)
    : "";

  return (
    <div
      className="h-screen overflow-y-auto"
      style={{ background: "var(--bg-primary)" }}
    >
      <Header />

      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="flex gap-10">
          {/* Main content */}
          <main className="min-w-0 max-w-2xl flex-1">
            {/* Back link */}
            <Link
              href="/research"
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
              Back to Research
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
                style={{ background: "rgba(220, 38, 38, 0.08)" }}
              >
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
                    {readingTime && (
                      <span
                        className="text-xs"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        {readingTime}
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

          {/* TOC sidebar — hidden on small screens */}
          {article && (
            <aside className="hidden xl:block w-56 shrink-0">
              <div className="sticky top-20">
                <TableOfContents containerSelector=".article-html" />
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ResearchArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return <ResearchArticleContent slug={slug} />;
}
