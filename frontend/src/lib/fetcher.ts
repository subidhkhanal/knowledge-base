const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const fetcher = (endpoint: string) =>
  fetch(`${API_URL}${endpoint}`).then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  });
