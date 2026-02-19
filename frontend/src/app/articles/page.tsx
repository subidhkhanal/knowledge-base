"use client";

import Link from "next/link";
import { Header } from "@/components/Header";
import { ArticleCard } from "@/components/ArticleCard";
import { useArticles } from "@/hooks/useArticles";

function ArticlesContent() {
  const { articles, isLoading, error, refetch } = useArticles();

  return (
    <div className="h-screen overflow-y-auto" style={{ background: "var(--bg-primary)" }}>
      <Header />

      <main className="mx-auto max-w-4xl px-6 py-12">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1
              className="text-2xl font-semibold tracking-tight"
              style={{ color: "var(--text-primary)" }}
            >
              Articles
            </h1>
            {!isLoading && !error && (
              <p
                className="mt-1 text-sm"
                style={{ color: "var(--text-tertiary)" }}
              >
                {articles.length} {articles.length === 1 ? "article" : "articles"}
              </p>
            )}
          </div>
          <button
            onClick={refetch}
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

        {/* Article grid */}
        {!isLoading && !error && (
          <>
            {articles.length === 0 ? (
              <div
                className="flex flex-col items-center justify-center rounded-xl py-16 text-center"
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
                  className="mb-4 text-xs"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  Publish conversations from the Chatbot to Webpage extension
                </p>
                <Link
                  href="/"
                  className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
                  style={{
                    background: "var(--accent)",
                    color: "white",
                    boxShadow: "var(--shadow-accent-glow)",
                  }}
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
                      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                    />
                  </svg>
                  Go to Chat
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {articles.map((article, index) => (
                  <ArticleCard key={article.slug} {...article} index={index} />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default function ArticlesPage() {
  return <ArticlesContent />;
}
