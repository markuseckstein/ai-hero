import type { Message } from "ai";
import { streamText, createDataStreamResponse } from "ai";
import { model } from "~/model";
import { auth } from "~/server/auth";
import { searchSerper } from "~/serper";
import { z } from "zod";
import { db } from "~/server/db";
import { users, userRequests } from "~/server/db/schema";
import { eq, and, gte, lt } from "drizzle-orm";

export const maxDuration = 60;

export async function POST(request: Request) {
  // Check authentication
  const session = await auth();
  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Fetch user from DB
  const user = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
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
    const requests = await db.query.userRequests.findMany({
      where: and(
        eq(userRequests.userId, user.id),
        gte(userRequests.createdAt, startOfDay),
        lt(userRequests.createdAt, endOfDay),
      ),
    });
    if (requests.length >= 100) {
      return new Response(JSON.stringify({ error: "Too Many Requests" }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // Log the request
  await db.insert(userRequests).values({ userId: user.id });

  const body = (await request.json()) as {
    messages: Array<Message>;
  };

  return createDataStreamResponse({
    execute: async (dataStream) => {
      const { messages } = body;

      const result = streamText({
        model,
        messages,
        tools: {
          searchWeb: {
            parameters: z.object({
              query: z.string().describe("The query to search the web for"),
            }),
            execute: async ({ query }, { abortSignal }) => {
              const results = await searchSerper(
                { q: query, num: 10 },
                abortSignal,
              );
              return results.organic.map((result) => ({
                title: result.title,
                link: result.link,
                snippet: result.snippet,
              }));
            },
          },
        },
        system: `You are an AI assistant with access to a web search tool. Always use the searchWeb tool to answer user questions, and always cite your sources with inline markdown links, e.g. [title](url). Format all URLs as markdown links in your answers. Do not answer questions without searching.`,
        maxSteps: 10,
      });

      result.mergeIntoDataStream(dataStream);
    },
    onError: (e) => {
      console.error(e);
      return "Oops, an error occured!";
    },
  });
}
