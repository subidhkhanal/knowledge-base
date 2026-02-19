"use client";

import { useState, useEffect, useCallback } from "react";
import { useApi } from "./useApi";

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
  }>;
}

export function useProjects() {
  const { apiFetch } = useApi();
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await apiFetch("/api/projects");
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects || []);
      } else {
        setError("Failed to load projects");
      }
    } catch {
      setError("Failed to connect to the server");
    } finally {
      setIsLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  return { projects, isLoading, error, refetch: fetchProjects };
}

export function useProject(slug: string) {
  const { apiFetch } = useApi();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProject = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await apiFetch(`/api/projects/${encodeURIComponent(slug)}`);
      if (res.ok) {
        const data = await res.json();
        setProject(data);
      } else if (res.status === 404) {
        setError("Project not found");
      } else {
        setError("Failed to load project");
      }
    } catch {
      setError("Failed to connect to the server");
    } finally {
      setIsLoading(false);
    }
  }, [slug, apiFetch]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  return { project, isLoading, error, refetch: fetchProject };
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
