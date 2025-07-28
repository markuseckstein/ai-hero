import { generateChatTitle } from "~/generate-chat-title";
import { geolocation } from "@vercel/functions";
import type { Message } from "ai";
import { appendResponseMessages, createDataStreamResponse } from "ai";
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
import type { AnswerTone, UserLocation } from "~/system-context";
import type { OurMessageAnnotation } from "~/types";

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
  // Collect annotations for reasoning steps
  const annotations: OurMessageAnnotation[] = [];

  // Mock geolocation headers in development
  if (process.env.NODE_ENV === "development") {
    request.headers.set("x-vercel-ip-country", "DE");
    request.headers.set("x-vercel-ip-country-region", "BY");
    request.headers.set("x-vercel-ip-city", "Bamberg");
  }

  // Get user location
  const { longitude, latitude, city, country } = geolocation(request);
  const userLocation: UserLocation = { longitude, latitude, city, country };
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

  // Generate chat title in parallel if new chat
  let titlePromise: Promise<string> | undefined;
  if (isNewChat) {
    titlePromise = generateChatTitle(messages);
  } else {
    titlePromise = Promise.resolve("");
  }
  // Save chat with placeholder title if new
  const upsertChatSpan = trace.span({
    name: "db-upsert-chat",
    input: {
      userId: user.id,
      chatId: currentChatId,
      title: isNewChat ? "Generating..." : undefined,
      messages,
    },
  });
  await upsertChat({
    userId: user.id,
    chatId,
    title: isNewChat ? "Generating..." : "",
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
        userLocation,
        onFinish: async ({ response }) => {
          console.log("onFinish", response);
          // Merge the existing messages with the response messages
          const updatedMessages = appendResponseMessages({
            messages,
            responseMessages: response.messages,
          });
          const lastMessage = updatedMessages[updatedMessages.length - 1];
          if (!lastMessage) {
            return;
          }

          lastMessage.annotations = annotations;
          // Persist updated messages with annotations and generated title
          const generatedTitle = await titlePromise;
          console.log("Generated chat title in onFinish:", {
            chatId,
            generatedTitle,
          });
          const upsertChatFinishSpan = trace.span({
            name: "db-upsert-chat-finish",
            input: { userId: user.id, chatId, title: generatedTitle, messages },
          });
          await upsertChat({
            userId: user.id,
            chatId,
            title: generatedTitle || "",
            messages: updatedMessages,
          });
          upsertChatFinishSpan.end({ output: "upserted" });
          await langfuse.flushAsync();
        },
        writeMessageAnnotation: (annotation) => {
          annotations.push(annotation);
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
