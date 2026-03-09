"use client";

import { useState, useCallback } from "react";
import useSWR, { mutate } from "swr";
import { useApi } from "./useApi";
import { fetcher } from "@/lib/fetcher";

export function useDeleteProject() {
  const { apiFetch } = useApi();
  const [isDeleting, setIsDeleting] = useState(false);

  const deleteProject = useCallback(
    async (slug: string) => {
      setIsDeleting(true);
      try {
        const res = await apiFetch(`/api/projects/${encodeURIComponent(slug)}`, {
          method: "DELETE",
        });
        if (res.ok) {
          await mutate("/api/projects");
          return await res.json();
        }
        const data = await res.json();
        throw new Error(data.detail || "Failed to delete project");
      } finally {
        setIsDeleting(false);
      }
    },
    [apiFetch]
  );

  return { deleteProject, isDeleting };
}

export interface ProjectListItem {
  id: number;
  slug: string;
  title: string;
  description: string;
  created_at: string;
  updated_at: string;
  article_count: number;
  document_count: number;
}

export interface ProjectDetail extends ProjectListItem {
  articles: Array<{
    slug: string;
    title: string;
    tags: string[];
    source: string;
    chunks_count: number;
    conversation_length: number;
    created_at: string;
    updated_at: string;
  }>;
  documents: Array<{
    source: string;
    source_type: string;
    chunk_count: number;
    document_id?: number;
  }>;
}

export function useProjects() {
  const { data, error, isLoading, mutate: refetch } = useSWR<{ projects: ProjectListItem[] }>(
    "/api/projects",
    fetcher,
  );

  return {
    projects: data?.projects ?? [],
    isLoading,
    error: error ? "Failed to connect to the server" : null,
    refetch,
  };
}

export function useProject(slug: string) {
  const { data, error, isLoading, mutate: refetch } = useSWR<ProjectDetail>(
    `/api/projects/${encodeURIComponent(slug)}`,
    fetcher,
  );

  return {
    project: data ?? null,
    isLoading,
    error: error ? "Failed to connect to the server" : null,
    refetch,
  };
}

export function useDeleteArticle() {
  const { apiFetch } = useApi();
  const [isDeleting, setIsDeleting] = useState(false);

  const deleteArticle = useCallback(
    async (slug: string) => {
      setIsDeleting(true);
      try {
        const res = await apiFetch(`/api/articles/${encodeURIComponent(slug)}`, {
          method: "DELETE",
        });
        if (res.ok) {
          await mutate((key: string) => typeof key === "string" && key.startsWith("/api/projects/"), undefined, { revalidate: true });
          return await res.json();
        }
        const data = await res.json();
        throw new Error(data.detail || "Failed to delete article");
      } finally {
        setIsDeleting(false);
      }
    },
    [apiFetch]
  );

  return { deleteArticle, isDeleting };
}

export function useDeleteDocument() {
  const { apiFetch } = useApi();
  const [isDeleting, setIsDeleting] = useState(false);

  const deleteDocument = useCallback(
    async (docId: number) => {
      setIsDeleting(true);
      try {
        const res = await apiFetch(`/api/documents/${docId}`, {
          method: "DELETE",
        });
        if (res.ok) {
          await mutate((key: string) => typeof key === "string" && key.startsWith("/api/projects/"), undefined, { revalidate: true });
          return await res.json();
        }
        const data = await res.json();
        throw new Error(data.detail || "Failed to delete document");
      } finally {
        setIsDeleting(false);
      }
    },
    [apiFetch]
  );

  return { deleteDocument, isDeleting };
}

export function useCreateProject() {
  const { apiFetch } = useApi();
  const [isCreating, setIsCreating] = useState(false);

  const createProject = useCallback(
    async (title: string, description: string = "") => {
      setIsCreating(true);
      try {
        const res = await apiFetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, description }),
        });
        if (res.ok) {
          await mutate("/api/projects");
          return await res.json();
        }
        const data = await res.json();
        throw new Error(data.detail || "Failed to create project");
      } finally {
        setIsCreating(false);
      }
    },
    [apiFetch]
  );

  return { createProject, isCreating };
}
