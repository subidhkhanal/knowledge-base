"use client";

import { useState, useEffect, useCallback } from "react";
import { useApi } from "./useApi";

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
  const { apiFetch } = useApi();
  const [articles, setArticles] = useState<ArticleListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchArticles = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await apiFetch("/api/articles");
      if (res.ok) {
        const data = await res.json();
        setArticles(data.articles || []);
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.detail || "Failed to load articles");
      }
    } catch {
      setError("Failed to connect to the server");
    } finally {
      setIsLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);

  return { articles, isLoading, error, refetch: fetchArticles };
}

export function useArticle(slug: string) {
  const { apiFetch } = useApi();
  const [article, setArticle] = useState<ArticleDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchArticle = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await apiFetch(`/api/articles/${encodeURIComponent(slug)}`);

      if (res.ok) {
        const data = await res.json();
        setArticle(data);
      } else if (res.status === 404) {
        setError("Article not found");
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.detail || "Failed to load article");
      }
    } catch {
      setError("Failed to connect to the server");
    } finally {
      setIsLoading(false);
    }
  }, [slug, apiFetch]);

  useEffect(() => {
    fetchArticle();
  }, [fetchArticle]);

  return { article, isLoading, error, refetch: fetchArticle };
}
