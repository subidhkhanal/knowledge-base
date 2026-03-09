"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";

export interface ArticleListItem {
  slug: string;
  title: string;
  tags: string[];
  source: string;
  chunks_count: number;
  conversation_length: number;
  created_at: string;
  updated_at: string;
}

export interface ArticleDetail extends ArticleListItem {
  content_markdown: string;
  content_html?: string;
}

export function useArticles() {
  const { data, error, isLoading, mutate: refetch } = useSWR<{ articles: ArticleListItem[] }>(
    "/api/articles",
    fetcher,
  );

  return {
    articles: data?.articles ?? [],
    isLoading,
    error: error ? "Failed to connect to the server" : null,
    refetch,
  };
}

export function useArticle(slug: string) {
  const { data, error, isLoading, mutate: refetch } = useSWR<ArticleDetail>(
    `/api/articles/${encodeURIComponent(slug)}`,
    fetcher,
  );

  return {
    article: data ?? null,
    isLoading,
    error: error ? "Failed to connect to the server" : null,
    refetch,
  };
}
