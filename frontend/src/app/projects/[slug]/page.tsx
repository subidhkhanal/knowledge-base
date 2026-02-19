"use client";

import { use, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Header } from "@/components/Header";
import { useProject } from "@/hooks/useProjects";
import { useToasts } from "@/hooks/useToasts";
import { useUpload } from "@/hooks/useUpload";
import { ToastContainer } from "@/components/Toast";
import { UploadModal } from "@/components/UploadModal";

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}

function ProjectDetailContent({ slug }: { slug: string }) {
  const { project, isLoading, error, refetch } = useProject(slug);
  const { toasts, addToast, removeToast, updateToast } = useToasts();
  const { uploadFile } = useUpload({ addToast, removeToast, updateToast });
  const [showUploadModal, setShowUploadModal] = useState(false);

  return (
    <div className="flex h-screen flex-col" style={{ background: "var(--bg-primary)" }}>
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <AnimatePresence>
        {showUploadModal && (
          <UploadModal
            onClose={() => setShowUploadModal(false)}
            onUpload={(file, projectId) => uploadFile(file, { projectId, onSuccess: refetch })}
            defaultProjectId={project?.id ?? null}
          />
        )}
      </AnimatePresence>

      <Header onUploadClick={() => setShowUploadModal(true)} />

      <div className="flex-1 overflow-y-auto">
        <main className="mx-auto max-w-4xl px-6 py-12">
          {/* Back link */}
          <Link
            href="/projects"
            className="mb-6 inline-flex items-center gap-1.5 text-sm"
            style={{ color: "var(--text-secondary)" }}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
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
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          )}

          {/* Error */}
          {error && (
            <div
              className="flex items-center gap-3 rounded-xl p-4"
              style={{ background: "var(--error-bg)" }}
            >
              <svg className="h-5 w-5" style={{ color: "var(--error)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm" style={{ color: "var(--error)" }}>{error}</p>
            </div>
          )}

          {/* Project content */}
          {project && (
            <>
              {/* Project header */}
              <div className="mb-8">
                <h1
                  className="text-2xl font-semibold tracking-tight"
                  style={{ color: "var(--text-primary)" }}
                >
                  {project.title}
                </h1>
                {project.description && (
                  <p
                    className="mt-2 text-sm leading-relaxed"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    {project.description}
                  </p>
                )}
                <p
                  className="mt-2 text-xs"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  {project.article_count} {project.article_count === 1 ? "article" : "articles"} · {project.document_count} {project.document_count === 1 ? "document" : "documents"}
                </p>
              </div>

              {/* Articles Section */}
              <section className="mb-12">
                <h2
                  className="mb-4 text-sm font-semibold uppercase tracking-wider"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  Articles
                </h2>

                {project.articles.length === 0 && (
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
                      <svg className="h-6 w-6" style={{ color: "var(--accent)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                      </svg>
                    </div>
                    <p className="mb-1 text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                      No articles yet
                    </p>
                    <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                      Publish conversations from the extension to this project
                    </p>
                  </div>
                )}

                {project.articles.length > 0 && (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {project.articles.map((article, index) => (
                      <Link key={article.slug} href={`/projects/${slug}/articles/${article.slug}`}>
                        <motion.div
                          initial={{ opacity: 0, y: 24 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{
                            duration: 0.6,
                            ease: [0.16, 1, 0.3, 1],
                            delay: index * 0.05,
                          }}
                          className="group flex flex-col gap-3 rounded-xl p-4 cursor-pointer"
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
                          {/* Source badge */}
                          <div className="flex items-center gap-2">
                            <span
                              className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium"
                              style={{
                                background:
                                  article.source === "claude"
                                    ? "rgba(217, 119, 6, 0.1)"
                                    : article.source === "web"
                                      ? "rgba(59, 130, 246, 0.1)"
                                      : "rgba(16, 185, 129, 0.1)",
                                color:
                                  article.source === "claude"
                                    ? "#f59e0b"
                                    : article.source === "web"
                                      ? "#3b82f6"
                                      : "#10b981",
                              }}
                            >
                              <span
                                className="h-1.5 w-1.5 rounded-full"
                                style={{
                                  background:
                                    article.source === "claude"
                                      ? "#f59e0b"
                                      : article.source === "web"
                                        ? "#3b82f6"
                                        : "#10b981",
                                }}
                              />
                              {article.source === "claude" ? "Claude" : article.source === "web" ? "Web" : "ChatGPT"}
                            </span>
                          </div>

                          {/* Title */}
                          <h3
                            className="text-sm font-medium leading-snug line-clamp-2"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {article.title}
                          </h3>

                          {/* Tags */}
                          {article.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
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

                          {/* Meta */}
                          <div className="flex items-center gap-3 text-xs" style={{ color: "var(--text-tertiary)" }}>
                            <span>{formatRelativeDate(article.created_at)}</span>
                            {article.conversation_length > 0 && (
                              <>
                                <span className="h-0.5 w-0.5 rounded-full" style={{ background: "var(--text-tertiary)" }} />
                                <span>{article.conversation_length} messages</span>
                              </>
                            )}
                          </div>
                        </motion.div>
                      </Link>
                    ))}
                  </div>
                )}
              </section>

              {/* Documents Section */}
              <section>
                <h2
                  className="mb-4 text-sm font-semibold uppercase tracking-wider"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  Documents
                </h2>

                {project.documents.length === 0 && (
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
                      <svg className="h-6 w-6" style={{ color: "var(--accent)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                      </svg>
                    </div>
                    <p className="mb-1 text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                      No documents yet
                    </p>
                    <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                      Upload documents using the button in the header
                    </p>
                  </div>
                )}

                {project.documents.length > 0 && (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {project.documents.map((document, index) => (
                      <motion.div
                        key={document.source}
                        initial={{ opacity: 0, y: 24 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          duration: 0.6,
                          ease: [0.16, 1, 0.3, 1],
                          delay: index * 0.05,
                        }}
                        className="flex flex-col gap-3 rounded-xl p-4"
                        style={{
                          background: "var(--bg-secondary)",
                          border: "1px solid var(--border)",
                          boxShadow: "var(--shadow-card)",
                        }}
                      >
                        {/* Type badge */}
                        <span
                          className="inline-flex w-fit items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium"
                          style={{
                            background: document.source_type === "pdf" ? "rgba(239, 68, 68, 0.1)" : "rgba(59, 130, 246, 0.1)",
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

                        <h3
                          className="text-sm font-medium leading-snug line-clamp-2"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {document.source}
                        </h3>

                        <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                          {document.chunk_count} {document.chunk_count === 1 ? "chunk" : "chunks"}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return <ProjectDetailContent slug={slug} />;
}
