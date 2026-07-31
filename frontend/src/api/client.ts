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

export interface SessionResponse {
  session_id: string;
  file_search_store_name: string;
}

export interface ChatResponse {
  response: string;
  grounding_metadata?: {
    web_search_queries?: string[];
    grounding_chunks?: Array<{
      retrieved_context?: {
        uri?: string;
        title?: string;
        page_number?: number | null;
        media_id?: string | null;
        text?: string | null;
      };
      web?: {
        uri?: string;
        title?: string;
      };
    }>;
  };
}

export interface UploadResponse {
  status: string;
  file_name: string;
  store_display_name?: string;
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

export const api = {
  createSession: async (displayName?: string): Promise<SessionResponse> => {
    const response = await apiClient.post<SessionResponse>('/session/create', {
      display_name: displayName,
    });
    return response.data;
  },

  getSession: async (sessionId: string) => {
    const response = await apiClient.get(`/session/${sessionId}`);
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
};
