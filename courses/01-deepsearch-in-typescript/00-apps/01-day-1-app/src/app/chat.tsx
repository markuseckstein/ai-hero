"use client";

import { ChatMessage } from "~/components/chat-message";
import { SignInModal } from "~/components/sign-in-modal";
import { useChat } from "@ai-sdk/react";
import { Loader } from "lucide-react";
import { useSession } from "next-auth/react";
import { useSignInModal } from "~/components/use-sign-in-modal";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { isNewChatCreated } from "~/utils";
import type { Message } from "ai";
import { StickToBottom } from "use-stick-to-bottom";

interface ChatProps {
  userName: string;
  isAuthenticated: boolean;
  chatId: string;
  isNewChat: boolean;
  initialMessages?: Message[];
}

export const ChatPage = ({ userName, chatId, isNewChat, isAuthenticated, initialMessages }: ChatProps) => {
  const router = useRouter();
  const { data: session } = useSession();

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
    body: { chatId, isNewChat },
    initialMessages,
  });


  console.log("ChatPage rendered with:", { initialMessages, messages, input, data, isLoading });



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
      <div className="flex flex-1 flex-col mx-auto w-full max-w-[75ch] p-4" role="log"
        aria-label="Chat messages">

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
