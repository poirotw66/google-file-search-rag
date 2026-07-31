import axios, { AxiosError } from 'axios';

const apiClient = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError | Error) => {
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNABORTED') {
        error.message = '請求逾時，請稍後再試';
      } else if (error.code === 'ECONNREFUSED' || error.message.includes('Network Error')) {
        error.message =
          '無法連接到後端服務。請確認後端是否正在運行在 http://localhost:8000';
      } else if (typeof error.response?.data === 'object' && error.response.data) {
        const detail = (error.response.data as { detail?: string }).detail;
        if (detail) {
          error.message = detail;
        }
      }
    }
    return Promise.reject(error);
  }
);

export const SESSION_STORAGE_KEY = 'docuchat_session_id';

export interface SessionResponse {
  session_id: string;
  file_search_store_name: string;
}

export interface SessionFile {
  original_name: string;
  store_display_name?: string;
  document_name?: string | null;
}

export interface SessionDetail {
  session_id: string;
  file_search_store_name: string;
  files: SessionFile[];
  messages: Array<{ role: string; content: string }>;
  message_count: number;
}

export interface CitationContext {
  uri?: string;
  title?: string;
  page_number?: number | null;
  media_id?: string | null;
  text?: string | null;
}

export interface ChatResponse {
  response: string;
  grounding_metadata?: {
    web_search_queries?: string[];
    grounding_chunks?: Array<{
      retrieved_context?: CitationContext;
      web?: {
        uri?: string;
        title?: string;
      };
    }>;
  };
}

export type StreamEvent =
  | { type: 'token'; text: string }
  | {
      type: 'done';
      response: string;
      grounding_metadata?: ChatResponse['grounding_metadata'];
    }
  | { type: 'error'; detail: string };

export interface UploadResponse {
  status: string;
  file_name: string;
  store_display_name?: string;
  document_name?: string | null;
  operation_name?: string;
}

export function getErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    return error.message || fallback;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

export function mediaUrl(sessionId: string, mediaId: string): string {
  const params = new URLSearchParams({
    session_id: sessionId,
    media_id: mediaId,
  });
  return `/api/chat/media?${params.toString()}`;
}

export const api = {
  createSession: async (displayName?: string): Promise<SessionResponse> => {
    const response = await apiClient.post<SessionResponse>('/session/create', {
      display_name: displayName,
    });
    return response.data;
  },

  getSession: async (sessionId: string): Promise<SessionDetail> => {
    const response = await apiClient.get<SessionDetail>(`/session/${sessionId}`);
    return response.data;
  },

  deleteSession: async (sessionId: string) => {
    const response = await apiClient.delete(`/session/${sessionId}`);
    return response.data;
  },

  clearMessages: async (sessionId: string) => {
    const response = await apiClient.post(`/session/${sessionId}/clear-messages`);
    return response.data;
  },

  uploadFile: async (
    sessionId: string,
    file: File,
    displayName?: string
  ): Promise<UploadResponse> => {
    const formData = new FormData();
    formData.append('session_id', sessionId);
    formData.append('file', file);
    if (displayName) {
      formData.append('display_name', displayName);
    }

    const response = await apiClient.post<UploadResponse>(
      '/upload/file',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 180000,
      }
    );
    return response.data;
  },

  deleteFile: async (
    sessionId: string,
    opts: { document_name?: string; store_display_name?: string }
  ) => {
    const response = await apiClient.delete('/upload/file', {
      params: {
        session_id: sessionId,
        ...opts,
      },
      timeout: 60000,
    });
    return response.data;
  },

  sendMessage: async (
    sessionId: string,
    message: string
  ): Promise<ChatResponse> => {
    const response = await apiClient.post<ChatResponse>(
      '/chat/message',
      {
        session_id: sessionId,
        message,
      },
      {
        timeout: 90000,
      }
    );
    return response.data;
  },

  streamMessage: async (
    sessionId: string,
    message: string,
    onEvent: (event: StreamEvent) => void,
    signal?: AbortSignal
  ): Promise<void> => {
    const response = await fetch('/api/chat/message/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, message }),
      signal,
    });

    if (!response.ok) {
      let detail = `串流請求失敗 (${response.status})`;
      try {
        const payload = await response.json();
        if (payload?.detail) detail = payload.detail;
      } catch {
        // ignore parse errors
      }
      throw new Error(detail);
    }

    if (!response.body) {
      throw new Error('瀏覽器不支援串流回應');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';
      for (const part of parts) {
        const line = part
          .split('\n')
          .map((item) => item.trim())
          .find((item) => item.startsWith('data:'));
        if (!line) continue;
        const raw = line.slice(5).trim();
        if (!raw) continue;
        try {
          onEvent(JSON.parse(raw) as StreamEvent);
        } catch {
          // skip malformed chunks
        }
      }
    }
  },
};
