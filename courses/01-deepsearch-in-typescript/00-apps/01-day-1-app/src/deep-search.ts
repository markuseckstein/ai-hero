import {
  type Message,
  type streamText,
  type StreamTextResult,
  type TelemetrySettings,
} from "ai";

import { runAgentLoop } from "./run-agent-loop";
import type { AnswerTone } from "./system-context";
import type { OurMessageAnnotation } from "./types";

export function streamFromDeepSearch(opts: {
  messages: Message[];
  tone: AnswerTone;
  onFinish: Parameters<typeof streamText>[0]["onFinish"];
  telemetry: TelemetrySettings;
  writeMessageAnnotation: (annotation: OurMessageAnnotation) => void;
}): Promise<StreamTextResult<{}, string>> {
  // Use the first user message as the initial question
  const initialQuestion =
    opts.messages.find((m) => m.role === "user")?.content || "";
  return runAgentLoop(initialQuestion, {
    tone: opts.tone,
    writeMessageAnnotation: opts.writeMessageAnnotation,
  });
}

export async function askDeepSearch(messages: Message[]): Promise<string> {
  const result = await streamFromDeepSearch({
    messages,
    tone: "ai_assistant", // Default tone for evals
    onFinish: () => {}, // stub for evaluation
    telemetry: {
      isEnabled: false,
    },
    writeMessageAnnotation: () => {}, // stub for evaluation
  });
  await result.consumeStream();
  return await result.text;
}
