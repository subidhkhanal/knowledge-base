"use client";

import { useState, useRef } from "react";
import Link from "next/link";

type UploadType = "pdf" | "audio" | "text";

interface UploadResult {
  success: boolean;
  message: string;
  source?: string;
  chunks_created?: number;
}

export default function UploadPage() {
  const [activeTab, setActiveTab] = useState<UploadType>("pdf");
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [textContent, setTextContent] = useState("");
  const [textTitle, setTextTitle] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const endpoint =
        activeTab === "pdf"
          ? "http://localhost:8000/api/upload/pdf"
          : "http://localhost:8000/api/upload/audio";

      const response = await fetch(endpoint, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        setResult({
          success: true,
          message: data.message,
          source: data.source,
          chunks_created: data.chunks_created,
        });
      } else {
        setResult({
          success: false,
          message: data.detail || "Upload failed",
        });
      }
    } catch (error) {
      setResult({
        success: false,
        message: "Failed to connect to the server. Is the backend running?",
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleTextSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!textContent.trim()) return;

    setIsUploading(true);
    setResult(null);

    try {
      const response = await fetch("http://localhost:8000/api/upload/text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: textContent,
          title: textTitle || "Untitled Note",
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setResult({
          success: true,
          message: data.message,
          source: data.source,
          chunks_created: data.chunks_created,
        });
        setTextContent("");
        setTextTitle("");
      } else {
        setResult({
          success: false,
          message: data.detail || "Upload failed",
        });
      }
    } catch (error) {
      setResult({
        success: false,
        message: "Failed to connect to the server. Is the backend running?",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const tabs = [
    { id: "pdf" as UploadType, label: "PDF", accept: ".pdf" },
    { id: "audio" as UploadType, label: "Audio", accept: ".mp3,.wav,.m4a,.flac,.ogg,.webm" },
    { id: "text" as UploadType, label: "Text/Notes", accept: "" },
  ];

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
              href="/sources"
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Sources
            </Link>
          </nav>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="mb-8 text-3xl font-bold text-gray-900 dark:text-white">
          Upload Content
        </h1>

        {/* Tabs */}
        <div className="mb-6 flex gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setResult(null);
              }}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Upload Area */}
        <div className="rounded-lg bg-white p-6 shadow dark:bg-gray-800">
          {activeTab === "text" ? (
            <form onSubmit={handleTextSubmit}>
              <div className="mb-4">
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Title (optional)
                </label>
                <input
                  type="text"
                  value={textTitle}
                  onChange={(e) => setTextTitle(e.target.value)}
                  placeholder="My Notes"
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div className="mb-4">
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Content
                </label>
                <textarea
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  placeholder="Paste your notes or text content here..."
                  rows={10}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={isUploading || !textContent.trim()}
                className="w-full rounded-lg bg-blue-600 py-3 font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isUploading ? "Processing..." : "Add to Knowledge Base"}
              </button>
            </form>
          ) : (
            <div>
              <div
                className="mb-4 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 p-8 transition-colors hover:border-blue-500 dark:border-gray-600 dark:hover:border-blue-500"
                onClick={() => fileInputRef.current?.click()}
              >
                <svg
                  className="mb-4 h-12 w-12 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
                <p className="mb-2 text-lg font-medium text-gray-700 dark:text-gray-300">
                  {activeTab === "pdf" ? "Upload PDF" : "Upload Audio"}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {activeTab === "pdf"
                    ? "Click to select a PDF file"
                    : "Supports MP3, WAV, M4A, FLAC, OGG, WebM"}
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept={tabs.find((t) => t.id === activeTab)?.accept}
                onChange={handleFileUpload}
                className="hidden"
                disabled={isUploading}
              />
              {isUploading && (
                <div className="flex items-center justify-center gap-2 text-blue-600">
                  <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24">
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
                  <span>Processing...</span>
                </div>
              )}
            </div>
          )}

          {/* Result */}
          {result && (
            <div
              className={`mt-4 rounded-lg p-4 ${
                result.success
                  ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                  : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
              }`}
            >
              <p className="font-medium">{result.message}</p>
              {result.success && result.chunks_created && (
                <p className="mt-1 text-sm">
                  Created {result.chunks_created} chunks from "{result.source}"
                </p>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
