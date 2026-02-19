"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Header } from "@/components/Header";
import { useApi } from "@/hooks/useApi";
import { useProjects } from "@/hooks/useProjects";

const PHASES = [
  { key: "planning", label: "Planning research angles" },
  { key: "researching", label: "Researching across the web" },
  { key: "analyzing", label: "Analyzing findings" },
  { key: "writing", label: "Writing article" },
  { key: "storing", label: "Storing in knowledge base" },
];

const PLACEHOLDER_TOPICS = [
  "transformer architecture in deep learning",
  "semiconductor war between US and China",
  "history of stoicism philosophy",
  "quantum computing current state",
  "the psychology of decision making",
];

interface ProgressEvent {
  type: "progress" | "complete" | "error";
  phase?: string;
  step?: number;
  total?: number;
  message?: string;
  slug?: string;
  title?: string;
  word_count?: number;
  sources_count?: number;
  sections_count?: number;
}

export default function ResearchPage() {
  const router = useRouter();
  const { apiFetch } = useApi();
  const { projects } = useProjects();

  const [topic, setTopic] = useState("");
  const [selectedProject, setSelectedProject] = useState("");
  const [isResearching, setIsResearching] = useState(false);
  const [currentPhase, setCurrentPhase] = useState("");
  const [progressMessage, setProgressMessage] = useState("");
  const [completedPhases, setCompletedPhases] = useState<Set<string>>(
    new Set()
  );
  const [error, setError] = useState<string | null>(null);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);

  // Rotate placeholder every 3 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIndex((i) => (i + 1) % PLACEHOLDER_TOPICS.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!topic.trim() || isResearching) return;

    setIsResearching(true);
    setError(null);
    setCurrentPhase("planning");
    setCompletedPhases(new Set());
    setProgressMessage("Starting research...");

    try {
      const body: Record<string, string> = { topic: topic.trim() };
      if (selectedProject) body.project_slug = selectedProject;

      const response = await apiFetch("/api/research/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || "Research failed to start");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data: ")) continue;

          try {
            const event: ProgressEvent = JSON.parse(line.slice(6));

            if (event.type === "progress") {
              const phaseIndex = PHASES.findIndex(
                (p) => p.key === event.phase
              );
              if (phaseIndex > 0) {
                setCompletedPhases((prev) => {
                  const next = new Set(prev);
                  for (let i = 0; i < phaseIndex; i++) {
                    next.add(PHASES[i].key);
                  }
                  return next;
                });
              }
              setCurrentPhase(event.phase || "");
              setProgressMessage(event.message || "");
            } else if (event.type === "complete") {
              setCompletedPhases(new Set(PHASES.map((p) => p.key)));
              setProgressMessage(
                `Done! ${event.word_count?.toLocaleString()} words written.`
              );
              setTimeout(() => {
                router.push(`/research/${event.slug}`);
              }, 1500);
            } else if (event.type === "error") {
              setError(event.message || "Research failed");
              setIsResearching(false);
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to connect to server";
      setError(msg);
      setIsResearching(false);
    }
  }, [topic, selectedProject, isResearching, apiFetch, router]);

  return (
    <div
      className="h-screen overflow-y-auto"
      style={{ background: "var(--bg-primary)" }}
    >
      <Header />

      <main className="mx-auto max-w-2xl px-6">
        <AnimatePresence mode="wait">
          {!isResearching ? (
            /* --- Input State --- */
            <motion.div
              key="input"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="flex min-h-[70vh] flex-col items-center justify-center"
            >
              <h1
                className="mb-2 text-3xl font-semibold tracking-tight"
                style={{ color: "var(--text-primary)" }}
              >
                Deep Research
              </h1>
              <p
                className="mb-8 text-center text-sm"
                style={{ color: "var(--text-secondary)" }}
              >
                Enter any topic and get a comprehensive, book-length research
                article
              </p>

              <div className="w-full max-w-lg space-y-4">
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                  placeholder={PLACEHOLDER_TOPICS[placeholderIndex]}
                  className="w-full rounded-xl px-4 py-3 text-base outline-none transition-all"
                  style={{
                    background: "var(--bg-secondary)",
                    border: "1px solid var(--border)",
                    color: "var(--text-primary)",
                  }}
                  autoFocus
                />

                {projects.length > 0 && (
                  <select
                    value={selectedProject}
                    onChange={(e) => setSelectedProject(e.target.value)}
                    className="w-full rounded-xl px-4 py-2.5 text-sm outline-none"
                    style={{
                      background: "var(--bg-secondary)",
                      border: "1px solid var(--border)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    <option value="">No project (standalone)</option>
                    {projects.map((p) => (
                      <option key={p.slug} value={p.slug}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                )}

                <button
                  onClick={handleSubmit}
                  disabled={!topic.trim()}
                  className="w-full rounded-xl py-3 text-sm font-medium transition-all cursor-pointer"
                  style={{
                    background: topic.trim()
                      ? "var(--accent)"
                      : "var(--bg-tertiary)",
                    color: topic.trim() ? "#fff" : "var(--text-tertiary)",
                    opacity: topic.trim() ? 1 : 0.6,
                  }}
                >
                  Start Research
                </button>

                {error && (
                  <div
                    className="rounded-xl p-3 text-sm"
                    style={{
                      background: "rgba(220, 38, 38, 0.08)",
                      color: "var(--error)",
                    }}
                  >
                    {error}
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            /* --- Progress State --- */
            <motion.div
              key="progress"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="flex min-h-[70vh] flex-col items-center justify-center"
            >
              <h2
                className="mb-2 text-xl font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                Researching
              </h2>
              <p
                className="mb-10 text-sm"
                style={{ color: "var(--text-secondary)" }}
              >
                &ldquo;{topic}&rdquo;
              </p>

              <div className="w-full max-w-md space-y-4">
                {PHASES.map((phase) => {
                  const isCompleted = completedPhases.has(phase.key);
                  const isActive = currentPhase === phase.key;

                  return (
                    <div key={phase.key} className="flex items-center gap-3">
                      {/* Status icon */}
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center">
                        {isCompleted ? (
                          <svg
                            className="h-5 w-5"
                            style={{ color: "var(--success)" }}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        ) : isActive ? (
                          <span
                            className="inline-block h-3 w-3 animate-pulse rounded-full"
                            style={{ background: "var(--accent)" }}
                          />
                        ) : (
                          <span
                            className="inline-block h-3 w-3 rounded-full"
                            style={{
                              border: "2px solid var(--border)",
                            }}
                          />
                        )}
                      </div>

                      {/* Phase label */}
                      <span
                        className="text-sm"
                        style={{
                          color: isCompleted
                            ? "var(--success)"
                            : isActive
                              ? "var(--text-primary)"
                              : "var(--text-tertiary)",
                          fontWeight: isActive ? 500 : 400,
                        }}
                      >
                        {phase.label}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Detail message */}
              <p
                className="mt-8 max-w-md text-center text-xs"
                style={{ color: "var(--text-tertiary)" }}
              >
                {progressMessage}
              </p>

              {error && (
                <div className="mt-6 space-y-3 text-center">
                  <p
                    className="text-sm"
                    style={{ color: "var(--error)" }}
                  >
                    {error}
                  </p>
                  <button
                    onClick={() => {
                      setIsResearching(false);
                      setError(null);
                    }}
                    className="rounded-lg px-4 py-2 text-sm cursor-pointer"
                    style={{
                      background: "var(--accent-subtle)",
                      color: "var(--accent)",
                    }}
                  >
                    Try Again
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
