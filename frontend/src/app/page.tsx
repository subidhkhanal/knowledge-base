"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Header } from "@/components/Header";
import { ProjectsView } from "@/components/ProjectsView";
import { useAuth } from "@/contexts/AuthContext";

/* ─── animation constants ─── */

const EASE = [0.16, 1, 0.3, 1] as const;

const sectionVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: EASE },
  },
};

const scaleIn = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.6, ease: EASE },
  },
};

/* ─── data ─── */

const steps = [
  {
    title: "Save anything",
    desc: "Paste an AI conversation, clip a web article, or upload a document.",
  },
  {
    title: "AI indexes it",
    desc: "Content is chunked, embedded, and indexed automatically.",
  },
  {
    title: "Ask a question",
    desc: "Search in plain English across everything you've saved.",
  },
  {
    title: "Get cited answers",
    desc: "AI answers with exact sources so you can verify.",
  },
];

const features = [
  {
    title: "Save AI Conversations",
    description:
      "Paste a conversation from Claude or ChatGPT. It gets auto-structured into a clean, readable article and indexed for search.",
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
      </svg>
    ),
  },
  {
    title: "Clip Web Articles",
    description:
      "Save any web article with our browser extension. Content is extracted, cleaned up, and added to your knowledge base in one click.",
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
      </svg>
    ),
  },
  {
    title: "Upload Documents",
    description:
      "Import PDFs, EPUBs, Word files, HTML, and text. Everything gets chunked and indexed so you can search inside them.",
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
      </svg>
    ),
  },
  {
    title: "AI-Powered Search",
    description:
      "Ask questions in plain English. Hybrid search finds the most relevant passages across all your content, and AI answers with citations.",
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 7l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2z" />
      </svg>
    ),
  },
  {
    title: "Deep Research",
    description:
      "AI researches any topic using the web plus your own knowledge base, then writes a structured article with sources.",
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
  },
  {
    title: "Built-in Reader",
    description:
      "Read PDFs and EPUBs right in the app. Customize fonts, sizes, and reading preferences to your liking.",
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
      </svg>
    ),
  },
];

const useCases = [
  {
    title: "Students & Researchers",
    desc: "Save papers, lecture notes, and research articles. Ask questions across your entire reading list.",
    icon: (
      <svg className="h-5 w-5" style={{ color: "var(--accent)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.26 10.147a60.438 60.438 0 00-.491 6.347A48.62 48.62 0 0112 20.904a48.62 48.62 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.636 50.636 0 00-2.658-.813A59.906 59.906 0 0112 3.493a59.903 59.903 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15v-3.75m0 0h-.008v.008H6.75v-.008z" />
      </svg>
    ),
  },
  {
    title: "Developers",
    desc: "Keep AI coding conversations, documentation, and technical articles organized and searchable.",
    icon: (
      <svg className="h-5 w-5" style={{ color: "var(--accent)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
      </svg>
    ),
  },
  {
    title: "Writers & Creators",
    desc: "Collect inspiration, reference material, and drafts. Find connections across your creative library.",
    icon: (
      <svg className="h-5 w-5" style={{ color: "var(--accent)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
      </svg>
    ),
  },
  {
    title: "Lifelong Learners",
    desc: "Save anything interesting you find online. Build a personal library that actually remembers what you've read.",
    icon: (
      <svg className="h-5 w-5" style={{ color: "var(--accent)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
  },
];

/* ─── component ─── */

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

      {/* ─── HERO ─── */}
      <motion.section
        variants={sectionVariants}
        initial="hidden"
        animate="visible"
        className="relative px-4 pt-16 pb-12 sm:px-6 md:pt-28 md:pb-20 lg:pt-32 lg:pb-24"
      >
        {/* Background glow */}
        <div
          className="pointer-events-none absolute top-0 left-1/2 h-[500px] w-[700px] -translate-x-1/2 rounded-full opacity-30 blur-3xl md:h-[600px] md:w-[800px]"
          style={{ background: "radial-gradient(circle, var(--accent-subtle) 0%, transparent 70%)" }}
        />

        <div className="relative mx-auto max-w-3xl text-center">
          {/* Badge */}
          <motion.div variants={fadeUp}>
            <span
              className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-medium"
              style={{
                background: "var(--accent-subtle)",
                color: "var(--accent)",
                border: "1px solid var(--border-accent)",
              }}
            >
              <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8L12 2z" />
              </svg>
              Your AI-powered second brain
            </span>
          </motion.div>

          {/* Heading */}
          <motion.h1
            variants={fadeUp}
            className="mt-8 text-3xl font-bold tracking-tight md:text-5xl lg:text-6xl"
            style={{ color: "var(--text-primary)", lineHeight: 1.12 }}
          >
            Remember everything you read, learn, and discover
          </motion.h1>

          {/* Subheading */}
          <motion.p
            variants={fadeUp}
            className="mx-auto mt-6 max-w-2xl text-base leading-relaxed md:text-lg"
            style={{ color: "var(--text-secondary)" }}
          >
            Save conversations from ChatGPT and Claude, clip web articles,
            upload documents — then ask questions and get answers
            with sources from everything you&apos;ve saved.
          </motion.p>

          {/* CTA */}
          <motion.div variants={fadeUp} className="mt-10 flex flex-col items-center gap-3">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-xl px-8 py-3.5 text-sm font-semibold text-white shadow-lg transition-transform duration-200 active:scale-[0.97]"
              style={{
                background: "linear-gradient(135deg, var(--accent) 0%, #0284c7 100%)",
                boxShadow: "0 4px 14px rgba(14, 165, 233, 0.35)",
              }}
            >
              Get Started Free
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
            <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              No credit card required
            </span>
          </motion.div>
        </div>

        {/* Hero illustration — 3 overlapping mock cards */}
        <motion.div
          variants={scaleIn}
          className="relative mx-auto mt-16 h-48 max-w-xl sm:h-56 md:mt-20 md:h-64"
        >
          {/* Left card — AI conversation */}
          <div
            className="absolute top-4 left-0 hidden w-56 rounded-xl p-4 sm:block md:left-4 md:w-60"
            style={{
              background: "var(--bg-primary)",
              border: "1px solid var(--border)",
              boxShadow: "var(--shadow-card)",
              transform: "rotate(-6deg)",
            }}
          >
            <div className="mb-3 flex items-center gap-2">
              <div className="h-6 w-6 rounded-md" style={{ background: "var(--accent-subtle)" }}>
                <svg className="h-6 w-6 p-1" style={{ color: "var(--accent)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <div className="h-2 w-20 rounded-full" style={{ background: "var(--bg-secondary)" }} />
            </div>
            <div className="space-y-2">
              <div className="h-2 w-full rounded-full" style={{ background: "var(--bg-secondary)" }} />
              <div className="h-2 w-3/4 rounded-full" style={{ background: "var(--bg-secondary)" }} />
              <div className="h-2 w-5/6 rounded-full" style={{ background: "var(--bg-secondary)" }} />
              <div className="h-2 w-2/3 rounded-full" style={{ background: "var(--bg-secondary)" }} />
            </div>
          </div>

          {/* Center card — web article (elevated) */}
          <div
            className="absolute top-0 left-1/2 z-10 w-60 -translate-x-1/2 rounded-xl p-4 md:w-64"
            style={{
              background: "var(--bg-primary)",
              border: "1px solid var(--border)",
              boxShadow: "var(--shadow-card-hover)",
            }}
          >
            <div className="mb-3 flex items-center gap-2">
              <div className="h-6 w-6 rounded-md" style={{ background: "var(--accent-subtle)" }}>
                <svg className="h-6 w-6 p-1" style={{ color: "var(--accent)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9" />
                </svg>
              </div>
              <div className="h-2.5 w-28 rounded-full" style={{ background: "var(--bg-secondary)" }} />
            </div>
            <div className="space-y-2">
              <div className="h-2 w-full rounded-full" style={{ background: "var(--bg-secondary)" }} />
              <div className="h-2 w-5/6 rounded-full" style={{ background: "var(--bg-secondary)" }} />
              <div className="h-2 w-full rounded-full" style={{ background: "var(--bg-secondary)" }} />
              <div className="h-2 w-4/5 rounded-full" style={{ background: "var(--bg-secondary)" }} />
              <div className="h-2 w-3/4 rounded-full" style={{ background: "var(--bg-secondary)" }} />
            </div>
          </div>

          {/* Right card — document */}
          <div
            className="absolute top-4 right-0 hidden w-56 rounded-xl p-4 sm:block md:right-4 md:w-60"
            style={{
              background: "var(--bg-primary)",
              border: "1px solid var(--border)",
              boxShadow: "var(--shadow-card)",
              transform: "rotate(6deg)",
            }}
          >
            <div className="mb-3 flex items-center gap-2">
              <div className="h-6 w-6 rounded-md" style={{ background: "var(--accent-subtle)" }}>
                <svg className="h-6 w-6 p-1" style={{ color: "var(--accent)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              </div>
              <div className="h-2 w-24 rounded-full" style={{ background: "var(--bg-secondary)" }} />
            </div>
            <div className="space-y-2">
              <div className="h-2 w-full rounded-full" style={{ background: "var(--bg-secondary)" }} />
              <div className="h-2 w-4/5 rounded-full" style={{ background: "var(--bg-secondary)" }} />
              <div className="h-2 w-full rounded-full" style={{ background: "var(--bg-secondary)" }} />
              <div className="h-2 w-2/3 rounded-full" style={{ background: "var(--bg-secondary)" }} />
            </div>
          </div>
        </motion.div>
      </motion.section>

      {/* ─── HOW IT WORKS ─── */}
      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
        variants={sectionVariants}
        className="px-4 py-12 sm:px-6 md:py-20 lg:py-24"
      >
        <div className="mx-auto max-w-4xl">
          <motion.p
            variants={fadeUp}
            className="text-center text-xs font-semibold uppercase tracking-widest"
            style={{ color: "var(--accent)" }}
          >
            How it works
          </motion.p>

          <motion.h2
            variants={fadeUp}
            className="mt-3 text-center text-2xl font-bold tracking-tight md:text-3xl"
            style={{ color: "var(--text-primary)" }}
          >
            From saving to searching in seconds
          </motion.h2>

          <div className="mt-14 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, i) => (
              <motion.div
                key={step.title}
                variants={fadeUp}
                className="relative flex flex-col items-center text-center"
              >
                {/* Connecting line between steps (desktop only) */}
                {i < 3 && (
                  <div
                    className="absolute top-6 left-[calc(50%+28px)] hidden h-px lg:block"
                    style={{
                      width: "calc(100% - 56px)",
                      background: "var(--border)",
                    }}
                  />
                )}

                {/* Numbered circle */}
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold text-white"
                  style={{
                    background: "linear-gradient(135deg, var(--accent) 0%, #0284c7 100%)",
                    boxShadow: "0 2px 8px rgba(14, 165, 233, 0.25)",
                  }}
                >
                  {i + 1}
                </div>

                <h3
                  className="mt-4 text-sm font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  {step.title}
                </h3>

                <p
                  className="mt-2 max-w-[200px] text-xs leading-relaxed"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {step.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* ─── FEATURES ─── */}
      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
        variants={sectionVariants}
        className="px-4 py-12 sm:px-6 md:py-20 lg:py-24"
        style={{ background: "var(--bg-secondary)" }}
      >
        <div className="mx-auto max-w-5xl">
          <motion.p
            variants={fadeUp}
            className="text-center text-xs font-semibold uppercase tracking-widest"
            style={{ color: "var(--accent)" }}
          >
            Features
          </motion.p>

          <motion.h2
            variants={fadeUp}
            className="mt-3 text-center text-2xl font-bold tracking-tight md:text-3xl"
            style={{ color: "var(--text-primary)" }}
          >
            Everything you need to build your knowledge base
          </motion.h2>

          <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <motion.div
                key={feature.title}
                variants={fadeUp}
                whileHover={{ y: -2, boxShadow: "var(--shadow-card-hover)" }}
                transition={{ duration: 0.2 }}
                className="flex flex-col gap-4 rounded-xl p-6"
                style={{
                  background: "var(--bg-primary)",
                  border: "1px solid var(--border)",
                  boxShadow: "var(--shadow-card)",
                }}
              >
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-lg"
                  style={{
                    background: "var(--accent-subtle)",
                    color: "var(--accent)",
                  }}
                >
                  {feature.icon}
                </div>

                <h3
                  className="text-sm font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  {feature.title}
                </h3>

                <p
                  className="text-xs leading-relaxed"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* ─── PERFECT FOR ─── */}
      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
        variants={sectionVariants}
        className="px-4 py-12 sm:px-6 md:py-20 lg:py-24"
      >
        <div className="mx-auto max-w-4xl">
          <motion.p
            variants={fadeUp}
            className="text-center text-xs font-semibold uppercase tracking-widest"
            style={{ color: "var(--accent)" }}
          >
            Perfect for
          </motion.p>

          <motion.h2
            variants={fadeUp}
            className="mt-3 text-center text-2xl font-bold tracking-tight md:text-3xl"
            style={{ color: "var(--text-primary)" }}
          >
            Built for anyone who learns
          </motion.h2>

          <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2">
            {useCases.map((uc) => (
              <motion.div
                key={uc.title}
                variants={fadeUp}
                className="flex items-start gap-4 rounded-xl p-5"
                style={{
                  background: "var(--bg-primary)",
                  border: "1px solid var(--border)",
                  boxShadow: "var(--shadow-card)",
                }}
              >
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                  style={{ background: "var(--accent-subtle)" }}
                >
                  {uc.icon}
                </div>
                <div>
                  <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    {uc.title}
                  </h3>
                  <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                    {uc.desc}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* ─── CTA ─── */}
      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
        variants={sectionVariants}
        className="px-4 py-12 sm:px-6 md:py-20 lg:py-24"
      >
        <motion.div
          variants={fadeUp}
          className="mx-auto max-w-2xl rounded-2xl p-8 text-center md:p-12 lg:p-14"
          style={{
            background: "linear-gradient(135deg, var(--accent-subtle) 0%, rgba(14, 165, 233, 0.03) 100%)",
            border: "1px solid var(--border-accent)",
          }}
        >
          <h2
            className="text-2xl font-bold tracking-tight md:text-3xl"
            style={{ color: "var(--text-primary)" }}
          >
            Start building your knowledge base today
          </h2>

          <p
            className="mt-4 text-sm leading-relaxed md:text-base"
            style={{ color: "var(--text-secondary)" }}
          >
            Free to use. Your data stays yours.
          </p>

          <Link
            href="/login"
            className="mt-8 inline-flex items-center gap-2 rounded-xl px-8 py-3.5 text-sm font-semibold text-white shadow-lg transition-transform duration-200 active:scale-[0.97]"
            style={{
              background: "linear-gradient(135deg, var(--accent) 0%, #0284c7 100%)",
              boxShadow: "0 4px 14px rgba(14, 165, 233, 0.35)",
            }}
          >
            Get Started Free
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
        </motion.div>
      </motion.section>

      {/* ─── FOOTER ─── */}
      <footer className="px-4 py-8 sm:px-6" style={{ borderTop: "1px solid var(--border)" }}>
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-3 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2">
            <div
              className="flex h-6 w-6 items-center justify-center rounded-lg"
              style={{ background: "linear-gradient(135deg, var(--accent) 0%, #0284c7 100%)" }}
            >
              <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              Personal Knowledge Base
            </span>
          </div>
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            Built as a hobby project &middot; Open source
          </p>
        </div>
      </footer>
    </div>
  );
}
