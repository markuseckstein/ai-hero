import { type Message, type streamText, type StreamTextResult } from "ai";

import { runAgentLoop } from "./run-agent-loop";
import type { AnswerTone } from "./system-context";
import type { OurMessageAnnotation } from "./types";

export function streamFromDeepSearch(opts: {
  messages: Message[];
  tone: AnswerTone;
  onFinish: Parameters<typeof streamText>[0]["onFinish"];
  langfuseTraceId?: string;
  writeMessageAnnotation: (annotation: OurMessageAnnotation) => void;
}): Promise<StreamTextResult<{}, string>> {
  return runAgentLoop(opts.messages, {
    tone: opts.tone,
    writeMessageAnnotation: opts.writeMessageAnnotation,
    langfuseTraceId: opts.langfuseTraceId,
    onFinish: opts.onFinish,
  });
}

export async function askDeepSearch(messages: Message[]): Promise<string> {
  const result = await streamFromDeepSearch({
    messages,
    tone: "ai_assistant", // Default tone for evals
    onFinish: () => {}, // stub for evaluation
    langfuseTraceId: undefined, // stub for evaluation
    writeMessageAnnotation: () => {}, // stub for evaluation
  });
  await result.consumeStream();
  return await result.text;
}
