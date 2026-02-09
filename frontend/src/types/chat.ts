export interface Source {
  source: string;
  page: number | null;
  similarity: number;
  chunk_id?: string;
  text?: string;
}

export interface ChunkContext {
  id: string;
  text: string;
  source: string;
  source_type: string;
  page: number | null;
  chunk_index: number;
  total_chunks: number;
  prev_chunks: Array<{ text: string; chunk_index: number; page?: number }>;
  next_chunks: Array<{ text: string; chunk_index: number; page?: number }>;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  provider?: string;
  timestamp?: number;
}

export interface Toast {
  id: string;
  type: "success" | "error" | "loading";
  message: string;
  subMessage?: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
}
