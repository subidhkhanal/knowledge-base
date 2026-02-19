"use client";

import { useRef, useCallback } from "react";
import { useApi } from "./useApi";
import type { Toast } from "@/types/chat";

interface ToastHandlers {
  addToast: (toast: Omit<Toast, "id">) => string;
  removeToast: (id: string) => void;
  updateToast: (id: string, updates: Partial<Toast>) => void;
}

interface UploadOptions {
  projectId?: number | null;
  onSuccess?: () => void;
}

export function useUpload(toastHandlers: ToastHandlers) {
  const { createXhr } = useApi();
  const handlersRef = useRef(toastHandlers);
  handlersRef.current = toastHandlers;
  const processingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const uploadFile = useCallback(
    (file: File, options: UploadOptions = {}) => {
      const { addToast, removeToast, updateToast } = handlersRef.current;

      const toastId = addToast({
        type: "loading",
        message: `Uploading ${file.name}`,
        subMessage: "0%",
      });

      const formData = new FormData();
      formData.append("file", file);
      if (options.projectId) {
        formData.append("project_id", String(options.projectId));
      }

      const xhr = createXhr("POST", "/api/upload/document");

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);

          if (percent === 100) {
            updateToast(toastId, {
              message: `Processing ${file.name}`,
              subMessage: "Indexing document...",
            });

            let dots = 0;
            processingIntervalRef.current = setInterval(() => {
              dots = (dots + 1) % 4;
              updateToast(toastId, {
                subMessage: `Indexing document${".".repeat(dots)}`,
              });
            }, 500);
          } else {
            updateToast(toastId, { subMessage: `${percent}%` });
          }
        }
      });

      xhr.addEventListener("load", () => {
        if (processingIntervalRef.current) {
          clearInterval(processingIntervalRef.current);
          processingIntervalRef.current = null;
        }

        try {
          const data = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300) {
            removeToast(toastId);
            addToast({
              type: "success",
              message: "Upload complete",
              subMessage: "Document added to knowledge base",
            });
            options.onSuccess?.();
          } else {
            removeToast(toastId);
            addToast({
              type: "error",
              message: "Upload failed",
              subMessage: data.detail || "Unknown error",
            });
          }
        } catch {
          removeToast(toastId);
          addToast({
            type: "error",
            message: "Upload failed",
            subMessage: "Invalid response",
          });
        }
      });

      xhr.addEventListener("error", () => {
        if (processingIntervalRef.current) {
          clearInterval(processingIntervalRef.current);
          processingIntervalRef.current = null;
        }
        removeToast(toastId);
        addToast({
          type: "error",
          message: "Upload failed",
          subMessage: "Could not connect to server",
        });
      });

      xhr.send(formData);
    },
    [createXhr]
  );

  return { uploadFile };
}
