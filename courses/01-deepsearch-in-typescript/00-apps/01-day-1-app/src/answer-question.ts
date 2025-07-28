import { streamText, type StreamTextResult, smoothStream } from "ai";
import { markdownJoinerTransform } from "./markdown-joiner";
import { model } from "./model";
import { type SystemContext } from "./system-context";
import fs from "fs";

export function answerQuestion(
  ctx: SystemContext,
  opts?: { isFinal?: boolean; langfuseTraceId?: string },
): StreamTextResult<{}, string> {
  console.info("answerQuestion", { ctx, isFinal: opts?.isFinal });

  const tone = ctx.tone || "franke"; // Default to 'franke' if no tone is set

  // Use absolute paths for prompt files
  const tonePrompt = `./src/prompts/tone_${tone}.md`;

  let toneContent: string | undefined = undefined;
  try {
    toneContent = fs.readFileSync(tonePrompt, "utf-8");
  } catch (err) {
    console.warn(`Could not read tone prompt file: ${tonePrompt}`, err);
    toneContent = `You are a helpful AI assistant that answers questions based on the information gathered from web searches and scraped content. Your goal is to provide accurate and relevant answers to the user's question.`;
  }

  const formattingLinks = fs
    .readFileSync("./src/prompts/footnote_markdown_prompt.md", "utf-8")
    .trim();
  const formattingAnswers = fs
    .readFileSync("./src/prompts/formatting.md", "utf-8")
    .trim();

  const systemPrompt = `${toneContent}

${formattingLinks}
${formattingAnswers}

  When answering:
  1. Be thourough but concise
  2. Always cite your sources
  3. If you're unsure about something, say so
  
  
  
  ${
    opts?.isFinal
      ? `Note: We may not have all the information needed to answer the question completely. Please make your best effort to answer the user's question based on the available information.`
      : ""
  };
`;

  const prompt = `
  <question>
    ${ctx.getFirstUserMessage()}
  </question>
  
  Based on the following context, please answer the question:

<context>
${ctx.getQueryHistory()}

${ctx.getScrapeHistory()}
</context>

If you do not have enough information, explain what is missing and make your best attempt to answer anyway.`;

  const telemetry = opts?.langfuseTraceId
    ? {
        isEnabled: true,
        functionId: `final-answer`,
        metadata: { langfuseTraceId: opts.langfuseTraceId },
      }
    : undefined;

  const result = streamText({
    model,
    system: systemPrompt,
    prompt,
    experimental_transform: [
      markdownJoinerTransform(),
      smoothStream({ delayInMs: 20, chunking: "line" }),
    ],
    experimental_telemetry: telemetry,
    // maxTokens: 1024,
  });

  return result;
}
