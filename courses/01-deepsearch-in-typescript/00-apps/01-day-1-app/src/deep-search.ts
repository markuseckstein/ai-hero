import {
  type Message,
  type streamText,
  type StreamTextResult,
  type TelemetrySettings,
} from "ai";

import { runAgentLoop } from "./run-agent-loop";
import type { AnswerTone } from "./system-context";

export function streamFromDeepSearch(opts: {
  messages: Message[];
  tone: AnswerTone;
  onFinish: Parameters<typeof streamText>[0]["onFinish"];
  telemetry: TelemetrySettings;
}): Promise<StreamTextResult<{}, string>> {
  // Use the first user message as the initial question
  const initialQuestion =
    opts.messages.find((m) => m.role === "user")?.content || "";
  return runAgentLoop(initialQuestion, opts.tone);
}

export async function askDeepSearch(messages: Message[]): Promise<string> {
  const result = await streamFromDeepSearch({
    messages,
    tone: "ai_assistant", // Default tone for evals
    onFinish: () => {}, // stub for evaluation
    telemetry: {
      isEnabled: false,
    },
  });
  await result.consumeStream();
  return await result.text;
}
