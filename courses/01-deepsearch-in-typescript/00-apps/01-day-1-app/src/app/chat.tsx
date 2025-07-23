"use client";

import { useChat } from "@ai-sdk/react";
import type { Message } from "ai";
import { Loader } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { StickToBottom } from "use-stick-to-bottom";
import { ChatMessage } from "~/components/chat-message";
import { SignInModal } from "~/components/sign-in-modal";
import { useSignInModal } from "~/components/use-sign-in-modal";
import type { AnswerTone } from "~/system-context";
import { isNewChatCreated } from "~/utils";

interface ChatProps {
  userName: string;
  isAuthenticated: boolean;
  chatId: string;
  isNewChat: boolean;
  initialMessages?: Message[];
  tone: "franke" | "friend" | "ai_assistant";
}

export const ChatPage = ({
  userName,
  chatId,
  isNewChat,
  isAuthenticated,
  initialMessages,
  tone: _toneProp, // ignore prop, use local state
}: ChatProps) => {
  const [tone, setTone] = useState<AnswerTone>("franke");
  const router = useRouter();

  const { isOpen, open, close } = useSignInModal();

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit: baseHandleSubmit,
    isLoading,
    data,
  } = useChat({
    id: chatId,
    body: { chatId, isNewChat, tone },
    initialMessages,
  });

  console.log("ChatPage rendered with:", {
    initialMessages,
    messages,
    input,
    data,
    isLoading,
  });

  // Watch for new chat creation and redirect
  useEffect(() => {
    const lastDataItem = data?.[data.length - 1];
    if (lastDataItem && isNewChatCreated(lastDataItem)) {
      router.push(`?id=${lastDataItem.chatId}`);
    }
  }, [data, router]);

  // Wrap handleSubmit to show modal if not authenticated
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    if (!isAuthenticated) {
      e.preventDefault();
      open();
      return;
    }

    baseHandleSubmit(e);
  };

  return (
    <>
      <div
        className="mx-auto flex w-full max-w-[75ch] flex-1 flex-col p-4"
        role="log"
        aria-label="Chat messages"
      >
        <StickToBottom
          className="relative overflow-auto [&>div]:scrollbar-thin [&>div]:scrollbar-track-gray-800 [&>div]:scrollbar-thumb-gray-600 [&>div]:hover:scrollbar-thumb-gray-500"
          resize="smooth"
          initial="smooth"
        >
          <StickToBottom.Content>
            {messages.map((message, index) => (
              <ChatMessage
                key={index}
                parts={message.parts ?? []}
                role={message.role}
                userName={userName}
              />
            ))}
          </StickToBottom.Content>
        </StickToBottom>

        <div className="mb-2 flex items-center gap-2">
          <label htmlFor="tone-select" className="text-sm text-gray-300">
            Tone:
          </label>
          <select
            id="tone-select"
            value={tone}
            onChange={(e) =>
              setTone(e.target.value as "franke" | "friend" | "ai_assistant")
            }
            className="rounded border border-gray-700 bg-gray-800 p-1 text-gray-200"
          >
            <option value="franke">franke</option>
            <option value="friend">friend</option>
            <option value="ai_assistant">ai_assistant</option>
          </select>
        </div>

        <div className="border-t border-gray-700">
          <form onSubmit={handleSubmit} className="mx-auto max-w-[65ch] p-4">
            <div className="flex gap-2">
              <input
                value={input}
                onChange={handleInputChange}
                placeholder="Say something..."
                autoFocus
                aria-label="Chat input"
                className="flex-1 rounded border border-gray-700 bg-gray-800 p-2 text-gray-200 placeholder-gray-400 focus:border-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="rounded bg-gray-700 px-4 py-2 text-white hover:bg-gray-600 focus:border-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50 disabled:hover:bg-gray-700"
              >
                {isLoading ? (
                  <Loader className="size-4 animate-spin" />
                ) : (
                  "Send"
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      <SignInModal isOpen={isOpen} onClose={close} />
    </>
  );
};
