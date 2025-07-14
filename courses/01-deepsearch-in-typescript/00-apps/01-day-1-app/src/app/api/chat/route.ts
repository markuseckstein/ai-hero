import type { Message } from "ai";
import { streamText, createDataStreamResponse } from "ai";
import { model } from "~/model";
import { auth } from "~/server/auth";

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

  const body = (await request.json()) as {
    messages: Array<Message>;
  };

  return createDataStreamResponse({
    execute: async (dataStream) => {
      const { messages } = body;

      const result = streamText({
        model,
        messages,
        system: `You are an AI assistant with access to web search grounding. Always cite your sources with inline markdown links, e.g. [title](url). Format all URLs as markdown links in your answers.`,
        maxSteps: 10,
      });

      result.mergeIntoDataStream(dataStream, { sendSources: true });
    },
    onError: (e) => {
      console.error(e);
      return "Oops, an error occured!";
    },
  });
}
