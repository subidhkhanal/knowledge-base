"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Source {
  source: string;
  source_type: string;
  chunk_count: number;
}

interface Stats {
  total_sources: number;
  total_chunks: number;
  whisper_available: boolean;
}

export default function SourcesPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingSource, setDeletingSource] = useState<string | null>(null);

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [sourcesRes, statsRes] = await Promise.all([
        fetch(`${API_URL}/api/sources`),
        fetch(`${API_URL}/api/stats`),
      ]);

      if (sourcesRes.ok) {
        const sourcesData = await sourcesRes.json();
        setSources(sourcesData);
      }

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }
    } catch (err) {
      setError("Failed to connect to the server. Is the backend running?");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDelete = async (sourceName: string) => {
    if (!confirm(`Are you sure you want to delete "${sourceName}"?`)) return;

    setDeletingSource(sourceName);

    try {
      const response = await fetch(
        `${API_URL}/api/sources/${encodeURIComponent(sourceName)}`,
        { method: "DELETE" }
      );

      if (response.ok) {
        await fetchData();
      } else {
        const data = await response.json();
        alert(data.detail || "Failed to delete source");
      }
    } catch (err) {
      alert("Failed to connect to the server");
    } finally {
      setDeletingSource(null);
    }
  };

  const getSourceTypeIcon = (type: string) => {
    switch (type) {
      case "pdf":
        return (
          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"
              clipRule="evenodd"
            />
          </svg>
        );
      case "audio":
        return (
          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z"
              clipRule="evenodd"
            />
          </svg>
        );
      default:
        return (
          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 0h8v12H6V4z"
              clipRule="evenodd"
            />
          </svg>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Link href="/" className="text-xl font-bold text-gray-900 dark:text-white">
            Personal Knowledge Base
          </Link>
          <nav className="flex gap-4">
            <Link
              href="/"
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Chat
            </Link>
            <Link
              href="/upload"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Upload
            </Link>
          </nav>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Knowledge Base Sources
          </h1>
          <button
            onClick={fetchData}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Refresh
          </button>
        </div>

        {/* Stats */}
        {stats && (
          <div className="mb-8 grid grid-cols-3 gap-4">
            <div className="rounded-lg bg-white p-4 shadow dark:bg-gray-800">
              <p className="text-sm text-gray-500 dark:text-gray-400">Total Sources</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {stats.total_sources}
              </p>
            </div>
            <div className="rounded-lg bg-white p-4 shadow dark:bg-gray-800">
              <p className="text-sm text-gray-500 dark:text-gray-400">Total Chunks</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {stats.total_chunks}
              </p>
            </div>
            <div className="rounded-lg bg-white p-4 shadow dark:bg-gray-800">
              <p className="text-sm text-gray-500 dark:text-gray-400">Audio Support</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {stats.whisper_available ? "Available" : "Unavailable"}
              </p>
            </div>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <svg className="h-8 w-8 animate-spin text-blue-600" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
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
          <div className="rounded-lg bg-red-100 p-4 text-red-800 dark:bg-red-900 dark:text-red-200">
            {error}
          </div>
        )}

        {/* Sources List */}
        {!isLoading && !error && (
          <>
            {sources.length === 0 ? (
              <div className="rounded-lg bg-white p-8 text-center shadow dark:bg-gray-800">
                <p className="mb-4 text-gray-500 dark:text-gray-400">
                  No sources in your knowledge base yet.
                </p>
                <Link
                  href="/upload"
                  className="inline-block rounded-lg bg-blue-600 px-6 py-3 font-medium text-white hover:bg-blue-700"
                >
                  Upload Content
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {sources.map((source) => (
                  <div
                    key={source.source}
                    className="flex items-center justify-between rounded-lg bg-white p-4 shadow dark:bg-gray-800"
                  >
                    <div className="flex items-center gap-4">
                      <div className="text-gray-500 dark:text-gray-400">
                        {getSourceTypeIcon(source.source_type)}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {source.source}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {source.source_type} &bull; {source.chunk_count} chunks
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(source.source)}
                      disabled={deletingSource === source.source}
                      className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-600 dark:text-red-400 dark:hover:bg-red-900/20"
                    >
                      {deletingSource === source.source ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
