import { useState, useEffect } from 'react';
import MessageList, { Message } from './MessageList';
import InputArea from './InputArea';
import { api } from '../api/client';

interface ChatWindowProps {
  sessionId: string;
}

export default function ChatWindow({ sessionId }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSendMessage = async (content: string) => {
    // 添加使用者訊息
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
    };
    setMessages((prev) => [...prev, userMessage]);

    // 發送請求
    setIsLoading(true);
    try {
      const response = await api.sendMessage(sessionId, content);
      
      // 提取引用資訊
      const citations = response.grounding_metadata?.grounding_chunks
        ?.map((chunk) => chunk.retrieved_context)
        .filter((ctx) => ctx?.uri || ctx?.title) || [];

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.response,
        citations: citations.length > 0 ? citations : undefined,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error: any) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `錯誤：${error.response?.data?.detail || '無法取得回應'}`,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-hidden">
        <MessageList messages={messages} />
      </div>
      <InputArea onSendMessage={handleSendMessage} disabled={isLoading} />
    </div>
  );
}

