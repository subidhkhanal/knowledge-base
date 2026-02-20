"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Header } from "@/components/Header";
import { ProjectsView } from "@/components/ProjectsView";
import { useAuth } from "@/contexts/AuthContext";

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] as const },
  },
};

const features = [
  {
    title: "Save AI Conversations",
    description:
      "Paste a conversation from Claude or ChatGPT and it gets structured into a readable article and indexed for search.",
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
      </svg>
    ),
  },
  {
    title: "Clip Web Articles",
    description:
      "Save web articles to your knowledge base. Content is automatically extracted, tagged, and indexed for search.",
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
      </svg>
    ),
  },
  {
    title: "Upload Documents",
    description:
      "Import PDFs, EPUBs, Word documents, HTML, and plain text. Each gets chunked and indexed so you can search inside them.",
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
      </svg>
    ),
  },
  {
    title: "Ask Your Knowledge Base",
    description:
      "Ask questions in plain English. Hybrid search finds the most relevant chunks across everything you've saved, and an LLM answers with citations.",
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.5 9.5l1.5-1.5m0 0l1.5 1.5M11 8v4" />
      </svg>
    ),
  },
];

export default function Home() {
  const { isLoggedIn, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: "var(--bg-deep)" }}>
        <svg className="h-8 w-8 animate-spin" style={{ color: "var(--accent)" }} viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  if (isLoggedIn) {
    return <ProjectsView />;
  }

  return (
    <div className="h-screen overflow-y-auto" style={{ background: "var(--bg-deep)" }}>
      <Header />

      <motion.main
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="mx-auto max-w-3xl px-6"
      >
        {/* Hero */}
        <motion.section variants={itemVariants} className="pt-16 pb-12 text-center md:pt-24 md:pb-16">
          <div
            className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{ background: "linear-gradient(135deg, var(--accent) 0%, #0284c7 100%)" }}
          >
            <svg className="h-7 w-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>

          <h1
            className="mb-4 text-3xl font-semibold tracking-tight md:text-4xl"
            style={{ color: "var(--text-primary)", lineHeight: 1.3 }}
          >
            Your personal knowledge base
          </h1>

          <p
            className="mx-auto mb-8 max-w-xl text-base leading-relaxed md:text-lg"
            style={{ color: "var(--text-secondary)" }}
          >
            Save your conversations from Claude and ChatGPT, clip web articles,
            upload documents — and search across all of it with AI.
          </p>

          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-medium text-white"
            style={{ background: "linear-gradient(135deg, var(--accent) 0%, #0284c7 100%)" }}
          >
            Get Started
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>

          <p className="mt-4 text-xs" style={{ color: "var(--text-tertiary)" }}>
            A hobby project &middot; open source
          </p>
        </motion.section>

        {/* Feature Cards */}
        <motion.section variants={itemVariants} className="pb-16">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {features.map((feature, i) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.4 + i * 0.08 }}
                className="flex flex-col gap-3 rounded-xl p-5"
                style={{
                  background: "var(--bg-primary)",
                  border: "1px solid var(--border)",
                  boxShadow: "var(--shadow-card)",
                }}
              >
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-lg"
                  style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}
                >
                  {feature.icon}
                </div>
                <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  {feature.title}
                </h3>
                <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* Footer */}
        <motion.footer variants={itemVariants} className="pb-12 pt-4">
          <div style={{ borderTop: "1px solid var(--border)" }} className="pt-6 text-center">
            <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              Built as a hobby project &middot; open source on GitHub
            </p>
          </div>
        </motion.footer>
      </motion.main>
    </div>
  );
}
