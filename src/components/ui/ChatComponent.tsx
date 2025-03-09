"use client";

import React from "react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Send } from "lucide-react";
import MessageList from "./MessageList";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { Message } from "ai";

type Props = { chatId: number };

const ChatComponent = ({ chatId }: Props) => {
  const queryClient = useQueryClient();
  const { data = [] as Message[], isLoading: isMessagesLoading, error } = useQuery<Message[], Error>({
    queryKey: ["chat", chatId],
    queryFn: async () => {
      const response = await axios.post<Message[]>(
        "/api/get-messages",
        { chatId },
        { headers: { "Content-Type": "application/json" } }
      );
      if (!Array.isArray(response.data)) throw new Error("Invalid message data");
      console.log("Fetched messages:", response.data);
      return response.data;
    },
    retry: 3,
  });

  const [messages, setMessages] = React.useState<Message[]>(data);
  const [input, setInput] = React.useState("");
  const [chatError, setChatError] = React.useState<string | null>(null);
  const [isChatLoading, setIsChatLoading] = React.useState(false);

  const messageContainerRef = React.useRef<HTMLDivElement>(null);

  // Sync initial messages only once
  React.useEffect(() => {
    if (Array.isArray(data) && messages.length === 0) {
      console.log("Setting initial messages:", data);
      setMessages(data);
    }
  }, [data, messages.length]);

  // Auto-scroll and debug messages
  React.useEffect(() => {
    console.log("Current messages state:", messages);
    if (messageContainerRef.current) {
      messageContainerRef.current.scrollTo({
        top: messageContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    setChatError(null);
    setIsChatLoading(true);

    // Add user message
    //@ts-ignore
    const userMessage: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId, messages: [userMessage] }), // Send only the latest message
      });

      if (!response.ok) {
        const text = await response.text();
        console.error("Chat API error response:", text);
        setChatError(`Chat error: ${text}`);
        setIsChatLoading(false);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        setChatError("No response stream available");
        setIsChatLoading(false);
        return;
      }

      const decoder = new TextDecoder();
      let aiResponse = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        console.log("Raw client-side chunk:", chunk);
        try {
          const parsed = JSON.parse(chunk.trim());
          if (parsed.role === "assistant") {
            aiResponse += parsed.content;
            //@ts-ignore
            setMessages((prev) => {
              const lastWasAssistant = prev[prev.length - 1]?.role === "assistant";
              if (lastWasAssistant) {
                return [...prev.slice(0, -1), { role: "assistant", content: aiResponse }];
              }
              return [...prev, { role: "assistant", content: aiResponse }];
            });
          }
        } catch (e) {
          console.error("Failed to parse chunk:", chunk, e);
        }
      }

      // Sync with DB after streaming completes
      queryClient.invalidateQueries({ queryKey: ["chat", chatId] });
    } catch (error) {
      console.error("Fetch error:", error);
      setChatError(`Failed to process response: ${(error as Error).message}`);
    } finally {
      setIsChatLoading(false);
    }
  };

  if (error) return (
    <div className="p-4 text-red-500">
      Failed to load messages: {error.message}
      <Button onClick={() => queryClient.invalidateQueries({ queryKey: ["chat", chatId] })}>Retry</Button>
    </div>
  );

  return (
    <div className="relative flex flex-col h-screen">
      <div className="sticky top-0 z-10 p-2 bg-white">
        <h3 className="text-xl font-bold">Chat</h3>
      </div>
      <div ref={messageContainerRef} className="flex-1 overflow-scroll">
        <MessageList messages={messages} isLoading={isMessagesLoading} />
        {isChatLoading && <div className="p-2 text-gray-500">AI is responding...</div>}
        {chatError && <div className="p-2 text-red-500">{chatError}</div>}
      </div>
      <form onSubmit={handleSubmit} className="sticky bottom-0 z-10 p-2 bg-white">
        <div className="flex">
          <Input
            value={input}
            onChange={handleInputChange}
            placeholder="Ask any question about the PDF..."
            className="w-full"
            disabled={isChatLoading || isMessagesLoading}
            aria-label="Chat input"
          />
          <Button
            className="bg-blue-600 ml-2"
            disabled={isChatLoading || isMessagesLoading}
            aria-label="Send message"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  );
};

export default ChatComponent;