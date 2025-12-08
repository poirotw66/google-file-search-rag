import axios from 'axios';

const apiClient = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000, // 10 秒超時
});

// 添加請求攔截器來記錄錯誤
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.code === 'ECONNREFUSED' || error.message.includes('Network Error')) {
      error.message = '無法連接到後端服務。請確認後端是否正在運行在 http://localhost:8000';
    }
    return Promise.reject(error);
  }
);

export interface SessionResponse {
  session_id: string;
  file_search_store_name: string;
}

export interface ChatMessage {
  session_id: string;
  message: string;
}

export interface ChatResponse {
  response: string;
  grounding_metadata?: {
    web_search_queries?: string[];
    grounding_chunks?: Array<{
      retrieved_context?: {
        uri?: string;
        title?: string;
      };
    }>;
  };
}

export interface UploadResponse {
  status: string;
  file_name: string;
  operation_name?: string;
}

export const api = {
  // Session APIs
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

  // Upload API
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
        timeout: 120000, // 檔案上傳需要較長時間，設定 2 分鐘超時
      }
    );
    return response.data;
  },

  // Chat API
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
        timeout: 60000, // 對話可能需要較長時間，設定 1 分鐘超時
      }
    );
    return response.data;
  },
};

