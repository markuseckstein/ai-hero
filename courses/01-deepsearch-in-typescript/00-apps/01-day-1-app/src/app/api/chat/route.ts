import type { Message } from "ai";
import { streamText, createDataStreamResponse, appendResponseMessages } from "ai";
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

  await upsertChat({
    userId: user.id,
    chatId,
    title: chatTitle,
    messages,
  });

  // Create Langfuse trace for this chat session
  const trace = langfuse.trace({
    sessionId: currentChatId,
    name: "chat",
    userId: user.id,
  });

  return createDataStreamResponse({
    execute: async (dataStream) => {
      // If this is a new chat, send the ID to the frontend
      if (isNewChat) {
        dataStream.writeData({
          type: "NEW_CHAT_CREATED",
          chatId,
        });
      }



      const result = await streamText({
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
                date: result.date,
              }));
            },
          },
          scrapePages: {
            parameters: z.object({
              urls: z.array(z.string()).describe("List of URLs to scrape for full page content in markdown format"),
            }),
            execute: async ({ urls }) => {
              const crawlResults = await bulkCrawlWebsites({ urls });
              if (!crawlResults.success) {
                return {
                  error: crawlResults.error,
                  results: crawlResults.results.map(r => (
                    {
                      url: r.url,
                      data: r.result.success ? r.result.data : `Error: ${(r.result as any).error}`,
                    }))
                }

              }
              return {
                results: crawlResults.results.map(r => ({
                  url: r.url,
                  data: r.result.data
                }))
              }
            },
          },
        },
        system: `You are a helpful AI assistant with access to real-time web search capabilities. When answering questions:

1. Always search the web for up-to-date information when relevant
2. ALWAYS format URLs as markdown links using the format [title](url)
3. Be thorough but concise in your responses
4. If you're unsure about something, search the web to verify
5. When providing information, always include the source where you found it using markdown links
6. Never include raw URLs - always use markdown link format
7. When users ask for up-to-date information, use the current date to provide context about how recent the information is. The current date and time is: ${new Date().toLocaleString()}.
8. You have access to a tool called scrapePages. ALWAYS use scrapePages to extract the full text content of any web page you find in search results, not just the snippet. scrapePages takes a list of URLs and returns the full page content in markdown format. If scraping is not allowed, you will receive an error message for that URL.

Your workflow should be:
1. Use searchWeb to find 10 relevant URLs from diverse sources (news sites, blogs, official documentation, etc.)
2. Select 4-6 of the most relevant and diverse URLs to scrape
3. Use scrapePages to get full page content of those URLs
3. Use the full content to provide detailed, accurate answers

Remember to:
- Always scrape multiple sources (4-6) to ensure diverse perspectives
- use the searchWeb tool to get the full content of those URLs
- use the full content of a page to provide detailed, accurate answers
Also, always use the current date in your answers when users ask for up-to-date information.`,
        maxSteps: 10,
        experimental_telemetry: {
          isEnabled: true,
          functionId: "agent",
          metadata: {
            langfuseTraceId: trace.id,
          },
        },
        onFinish: async ({ response }) => {
          if (response?.messages) {
            const updatedMessages = appendResponseMessages({
              messages,
              responseMessages: response.messages,
            });

            // Update the chat with all messages including the AI response
            await upsertChat({
              userId: user.id,
              chatId,
              title: chatTitle,
              messages: updatedMessages,
            });
          }
          await langfuse.flushAsync();
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
