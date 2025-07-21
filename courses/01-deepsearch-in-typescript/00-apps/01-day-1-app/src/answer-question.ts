import { SystemContext } from "./system-context";
import { generateText, streamText, type StreamTextResult } from "ai";
import { model } from "./model";

export function answerQuestion(ctx: SystemContext, opts?: { isFinal?: boolean }): StreamTextResult<{}, string> {
  console.info("answerQuestion", { ctx, isFinal: opts?.isFinal });
  
  
    const systemPrompt = `You are a helpful AI assistant that answers questions based on the information gathered from web searches and scraped content.

  When answering:
  1. Be thourough but concise
  2. Always cite your sources using markdown links
  3. If you're unsure about something, say so
  4. Format URLs as markdown links using [title](url)
  5. Never include raw URLs - always use markdown link format
  
  
  
  ${opts?.isFinal
    ? `Note: We may not have all the information needed to answer the question completely. Please make your best effort to answer the user's question based on the available information.`
    : ""};
`;
  const prompt = `
  <question>
    ${ctx.initialQuestion}
  </question>
  
  Based on the following context, please answer the question:

<context>
${ctx.getQueryHistory()}

${ctx.getScrapeHistory()}
</context>

If you do not have enough information, explain what is missing and make your best attempt to answer anyway.`;
  const result =  streamText({
    model,
    system: systemPrompt,
    prompt,
    // maxTokens: 1024,
  });

  return result;
}
