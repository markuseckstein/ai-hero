import type { Message } from "ai";
import { createDataStreamResponse } from "ai";
import { and, eq, gte, lt } from "drizzle-orm";
import { Langfuse } from "langfuse";
import { streamFromDeepSearch } from "~/deep-search";
import { env } from "~/env";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { upsertChat } from "~/server/db/chats";
import { userRequests, users } from "~/server/db/schema";
import {
  checkRateLimit,
  recordRateLimit,
  type RateLimitConfig,
} from "~/server/redis/rate-limit";
import type { AnswerTone } from "~/system-context";

export const maxDuration = 60;

const langfuse = new Langfuse({
  environment: env.NODE_ENV,
});

const config: RateLimitConfig = {
  maxRequests: 4,
  maxRetries: 3,
  windowMs: 20_000,
  keyPrefix: "chat",
};

export async function POST(request: Request) {
  // Check the rate limit
  const rateLimitCheck = await checkRateLimit(config);

  if (!rateLimitCheck.allowed) {
    console.log("Rate limit exceeded, waiting...");
    const isAllowed = await rateLimitCheck.retry();
    // If the rate limit is still exceeded, return a 429
    if (!isAllowed) {
      return new Response("Rate limit exceeded", {
        status: 429,
      });
    }
  }

  // Record the request
  await recordRateLimit(config);

  const trace = langfuse.trace({
    sessionId: "chat",
    name: "chat",
    userId: "anonymous",
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
  const userSpan = trace.span({
    name: "db-find-user",
    input: { userId: session.user.id },
  });
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
    const rateLimitSpan = trace.span({
      name: "db-rate-limit-check",
      input: { userId: user.id, startOfDay, endOfDay },
    });
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
  const logRequestSpan = trace.span({
    name: "db-log-request",
    input: { userId: user.id },
  });
  await db.insert(userRequests).values({ userId: user.id });
  logRequestSpan.end({ output: "logged" });

  const { messages, chatId, isNewChat, tone } = (await request.json()) as {
    messages: Array<Message>;
    chatId: string;
    tone: AnswerTone;
    isNewChat?: boolean;
  };

  // Ensure we use the correct chatId for session
  const currentChatId = chatId || (isNewChat ? chatId : undefined);

  // Create or update the chat before streaming begins
  // Use the first message's content as the chat title
  const firstUserMessage = messages.find((m) => m.role === "user")?.content;
  const chatTitle =
    typeof firstUserMessage === "string"
      ? firstUserMessage.slice(0, 100)
      : "New Chat";

  const upsertChatSpan = trace.span({
    name: "db-upsert-chat",
    input: {
      userId: user.id,
      chatId: currentChatId,
      title: chatTitle,
      messages,
    },
  });
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
        tone,
        onFinish: async ({ response }) => {
          // if (response?.messages) {
          //   const updatedMessages = appendResponseMessages({
          //     messages,
          //     responseMessages: response.messages,
          //   });
          //   // Update the chat with all messages including the AI response
          //   const upsertChatFinishSpan = trace.span({ name: "db-upsert-chat-finish", input: { userId: user.id, chatId, title: chatTitle, messages: updatedMessages } });
          //   await upsertChat({
          //     userId: user.id,
          //     chatId,
          //     title: chatTitle,
          //     messages: updatedMessages,
          //   });
          //   upsertChatFinishSpan.end({ output: "upserted" });
          // }
          // await langfuse.flushAsync();
        },
        writeMessageAnnotation: (annotation) => {
          dataStream.writeMessageAnnotation(annotation);
        },
        langfuseTraceId: trace.id,
      });
      result.mergeIntoDataStream(dataStream);
    },
    onError: (e) => {
      console.error(e);
      return "Oops, an error occurred!";
    },
  });
}
