"use client";

import { motion } from "framer-motion";

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] },
  },
};

export function EmptyState() {
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="flex h-[60vh] flex-col items-center justify-center text-center"
    >
      <motion.div
        variants={itemVariants}
        className="mb-8 flex h-16 w-16 items-center justify-center rounded-2xl"
        style={{
          background: "var(--accent-subtle)",
          border: "1px solid var(--border-accent)",
        }}
      >
        <svg className="h-8 w-8" style={{ color: "var(--accent)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      </motion.div>
      <motion.h2
        variants={itemVariants}
        className="mb-3 text-2xl md:text-3xl font-semibold tracking-tight leading-tight"
        style={{ color: "var(--text-primary)" }}
      >
        Ask anything
      </motion.h2>
      <motion.p
        variants={itemVariants}
        className="max-w-md text-sm md:text-base leading-relaxed"
        style={{ color: "var(--text-secondary)" }}
      >
        Query your uploaded documents with AI-powered search
      </motion.p>
    </motion.div>
  );
}
