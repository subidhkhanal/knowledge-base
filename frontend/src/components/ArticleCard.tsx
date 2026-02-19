"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import type { ArticleListItem } from "@/hooks/useArticles";

interface ArticleCardProps extends ArticleListItem {
  index: number;
  projectSlug?: string;
}

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

function getSourceStyle(source: string) {
  if (source === "claude") {
    return { bg: "rgba(217, 119, 6, 0.1)", color: "#f59e0b", label: "Claude" };
  }
  if (source === "web") {
    return { bg: "rgba(59, 130, 246, 0.1)", color: "#3b82f6", label: "Web" };
  }
  return { bg: "rgba(16, 185, 129, 0.1)", color: "#10b981", label: "ChatGPT" };
}

export function ArticleCard({
  slug,
  title,
  tags,
  source,
  conversation_length,
  created_at,
  index,
  projectSlug,
}: ArticleCardProps) {
  const href = projectSlug
    ? `/projects/${projectSlug}/articles/${slug}`
    : `/projects/${slug}`;
  const sourceStyle = getSourceStyle(source);

  return (
    <Link href={href}>
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
              background: sourceStyle.bg,
              color: sourceStyle.color,
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: sourceStyle.color }}
            />
            {sourceStyle.label}
          </span>
        </div>

        {/* Title */}
        <h3
          className="text-sm font-medium leading-snug line-clamp-2"
          style={{ color: "var(--text-primary)" }}
        >
          {title}
        </h3>

        {/* Tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
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

        {/* Meta row */}
        <div
          className="flex items-center gap-3 text-xs"
          style={{ color: "var(--text-tertiary)" }}
        >
          <span>{formatRelativeDate(created_at)}</span>
          {conversation_length > 0 && (
            <>
              <span className="h-0.5 w-0.5 rounded-full" style={{ background: "var(--text-tertiary)" }} />
              <span>{conversation_length} messages</span>
            </>
          )}
        </div>
      </motion.div>
    </Link>
  );
}
