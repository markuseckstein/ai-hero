import { runAgentLoop } from "./run-agent-loop";
import type { AnswerTone, UserLocation } from "./system-context";
import type { OurMessageAnnotation } from "./types";
import type { Message, StreamTextResult } from "ai";
import { streamText } from "ai";

interface DeepSearchOptions {
  messages: Message[];
  tone: AnswerTone;
  userLocation?: UserLocation;
  onFinish: Parameters<typeof streamText>[0]["onFinish"];
  langfuseTraceId?: string;
  writeMessageAnnotation: (annotation: OurMessageAnnotation) => void;
}

export function streamFromDeepSearch(
  opts: DeepSearchOptions,
): Promise<StreamTextResult<{}, string>> {
  return runAgentLoop(opts.messages, {
    tone: opts.tone,
    userLocation: opts.userLocation,
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
