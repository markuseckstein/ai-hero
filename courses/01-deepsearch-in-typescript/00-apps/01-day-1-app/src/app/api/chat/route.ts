import type { Message } from "ai";
import { createDataStreamResponse, appendResponseMessages } from "ai";
import { streamFromDeepSearch } from "~/deep-search";
import { model } from "~/model";
import { auth } from "~/server/auth";
import { searchSerper } from "~/serper";
import { bulkCrawlWebsites } from "~/server/scraper";
import { z } from "zod";
import { db } from "~/server/db";
import { users, userRequests } from "~/server/db/schema";
import { eq, and, gte, lt } from "drizzle-orm";
import { upsertChat } from "~/server/db/chats";
import { Langfuse } from "langfuse";
import { env } from "~/env";

export const maxDuration = 60;

const langfuse = new Langfuse({
  environment: env.NODE_ENV,
});



export async function POST(request: Request) {

  const trace = langfuse.trace({
    sessionId: "chat",
    name: "chat",
    userId: "anonymous"
  });

  // Check authentication
  const authSpan = trace.span({ name: "auth", input: {} });
  const session = await auth();
  authSpan.end({ output: session });
  trace.update({ userId: session?.user.id });

  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Fetch user from DB
  const userSpan = trace.span({ name: "db-find-user", input: { userId: session.user.id } });
  const user = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  userSpan.end({ output: user });
  if (!user) {
    return new Response(JSON.stringify({ error: "User not found" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Rate limit: allow 100 requests per day for non-admins
  const isAdmin = user.isAdmin;
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
  );

  if (!isAdmin) {
    const rateLimitSpan = trace.span({ name: "db-rate-limit-check", input: { userId: user.id, startOfDay, endOfDay } });
    const requests = await db.query.userRequests.findMany({
      where: and(
        eq(userRequests.userId, user.id),
        gte(userRequests.createdAt, startOfDay),
        lt(userRequests.createdAt, endOfDay),
      ),
    });
    rateLimitSpan.end({ output: requests });
    if (requests.length >= 100) {
      return new Response(JSON.stringify({ error: "Too Many Requests" }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // Log the request
  const logRequestSpan = trace.span({ name: "db-log-request", input: { userId: user.id } });
  await db.insert(userRequests).values({ userId: user.id });
  logRequestSpan.end({ output: "logged" });

  const { messages, chatId, isNewChat } = await request.json() as {
    messages: Array<Message>;
    chatId: string;
    isNewChat?: boolean;
  };

  // Ensure we use the correct chatId for session
  const currentChatId = chatId || (isNewChat ? chatId : undefined);

  // Create or update the chat before streaming begins
  // Use the first message's content as the chat title
  const firstUserMessage = messages.find(m => m.role === 'user')?.content;
  const chatTitle = typeof firstUserMessage === 'string'
    ? firstUserMessage.slice(0, 100)
    : 'New Chat';

  const upsertChatSpan = trace.span({ name: "db-upsert-chat", input: { userId: user.id, chatId: currentChatId, title: chatTitle, messages } });
  await upsertChat({
    userId: user.id,
    chatId,
    title: chatTitle,
    messages,
  });
  upsertChatSpan.end({ output: "upserted" });
  // Update trace sessionId after chat creation
  trace.update({ sessionId: currentChatId });



  return createDataStreamResponse({
    execute: async (dataStream) => {
      // If this is a new chat, send the ID to the frontend
      if (isNewChat) {
        dataStream.writeData({
          type: "NEW_CHAT_CREATED",
          chatId,
        });
      }



      const result = await streamFromDeepSearch({
        messages,
        onFinish: async ({ response }) => {
          if (response?.messages) {
            const updatedMessages = appendResponseMessages({
              messages,
              responseMessages: response.messages,
            });
            // Update the chat with all messages including the AI response
            const upsertChatFinishSpan = trace.span({ name: "db-upsert-chat-finish", input: { userId: user.id, chatId, title: chatTitle, messages: updatedMessages } });
            await upsertChat({
              userId: user.id,
              chatId,
              title: chatTitle,
              messages: updatedMessages,
            });
            upsertChatFinishSpan.end({ output: "upserted" });
          }
          await langfuse.flushAsync();
        },
        telemetry: {
          isEnabled: true,
          functionId: "agent",
          metadata: {
            langfuseTraceId: trace.id,
          },
        },
      });
      result.mergeIntoDataStream(dataStream);
    },
    onError: (e) => {
      console.error(e);
      return "Oops, an error occurred!";
    },
  });
}
