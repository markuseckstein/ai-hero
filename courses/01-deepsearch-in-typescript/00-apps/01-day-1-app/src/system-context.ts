import { z } from "zod";
import { generateObject, type Message } from "ai";
import { model } from "./model";

export type ScrapeResult = {
  url: string;
  result: string;
};

export type SearchResult = {
  date: string;
  title: string;
  url: string;
  snippet: string;
  summary: string;
};

export type SearchHistoryEntry = {
  query: string;
  results: SearchResult[];
};

export type AnswerTone = "franke" | "friend" | "ai_assistant";

export interface UserLocation {
  longitude?: string;
  latitude?: string;
  city?: string;
  country?: string;
}

export class SystemContext {
  public location?: UserLocation;
  private step = 0;
  // private queryHistory: QueryResult[] = [];
  // private scrapeHistory: ScrapeResult[] = [];
  private readonly messages: Message[];
  private readonly searchHistory: SearchHistoryEntry[] = [];

  constructor(
    messages: Message[],
    public readonly tone: AnswerTone,
    location?: UserLocation,
  ) {
    this.messages = messages;
    this.location = location;
  }

  private lastFeedback?: string;

  reportSearch(search: SearchHistoryEntry) {
    this.searchHistory.push(search);
  }

  setLastFeedback(feedback: string) {
    this.lastFeedback = feedback;
  }

  getLastFeedback(): string | undefined {
    return this.lastFeedback;
  }

  getSearchHistory(): string {
    return this.searchHistory
      .map((search) =>
        [
          `## Query: "${search.query}"`,
          ...search.results.map((result) =>
            [
              `### ${result.date} - ${result.title}`,
              result.url,
              result.snippet,
              `<scrape_result>`,
              result.summary,
              `</scrape_result>`,
            ].join("\n\n"),
          ),
        ].join("\n\n"),
      )
      .join("\n\n");
  }

  getFirstUserMessage(): string {
    if (!this.messages) return "";
    for (const msg of this.messages) {
      if (msg && msg.role === "user") {
        return msg.content ?? "";
      }
    }
    return "";
  }

  getLocationContext(): string {
    if (!this.location) return "";
    return `About the origin of user's request:\n- lat: ${this.location.latitude}\n- lon: ${this.location.longitude}\n- city: ${this.location.city}\n- country: ${this.location.country}`;
  }

  getMessageHistory(): string {
    return this.messages
      .map((message) => {
        const role = message.role === "user" ? "User" : "Assistant";
        return `<${role}>${message.content}</${role}>`;
      })
      .join("\n\n");
  }

  shouldStop() {
    return this.step >= 4;
  }

  incrementStep() {
    this.step++;
  }

  get currentStep() {
    return this.step;
  }
}

export const actionSchema = z.object({
  title: z
    .string()
    .describe(
      "The title of the action, to be displayed in the UI. Be extremely concise. 'Continuing search', 'Providing answer'",
    ),
  reasoning: z.string().describe("The reason you chose this step."),
  type: z.enum(["continue", "answer"]).describe(
    `The type of action to take.
      - 'continue': Continue searching for more information.
      - 'answer': Answer the user's question and complete the loop.`,
  ),
  feedback: z
    .string()
    .optional()
    .describe(
      "Required only when type is 'continue'. Detailed feedback about what information is missing or what needs to be improved in the search. This will be used to guide the next search iteration.",
    ),
});

export const getNextAction = async (
  context: SystemContext,
  langfuseTraceId?: string,
) => {
  const telemetry = langfuseTraceId
    ? {
        isEnabled: true,
        functionId: `agent-step-${context.currentStep}`,
        metadata: { langfuseTraceId: langfuseTraceId },
      }
    : undefined;

  const result = await generateObject({
    model,
    schema: actionSchema,
    experimental_telemetry: telemetry,
    system: `You are a research query optimizer. Your task is to analyze search results against the original research goal and either decide to answer the question or to search for more information.

PROCESS:
1. Identify ALL information explicitly requested in the original research goal
2. Analyze what specific information has been successfully retrieved in the search results
3. Identify ALL information gaps between what was requested and what was found
4. For entity-specific gaps: Create targeted queries for each missing attribute of identified entities
5. For general knowledge gaps: Create focused queries to find the missing conceptual information

When providing feedback (only required when type is 'continue'):
- Be specific about what information is missing
- Explain why the current information is insufficient
- Suggest what kind of information would be most helpful
- Consider both factual gaps and conceptual understanding gaps`,
    prompt: `Message History:
${context.getMessageHistory()}

Based on this context, choose the next action:
1. If you need more information, use 'continue' and provide detailed feedback about what's missing.
2. If you have enough information to answer the question, use 'answer'.

Remember:
- When using 'continue':
  * You MUST provide detailed feedback about what information is missing
  * Feedback should explain why current information is insufficient
  * Feedback will guide the next search iteration
- When using 'answer':
  * Do NOT include any feedback
  * Only choose this when you have enough information to answer completely

Here is the search history:

 <context>
    ${context.getSearchHistory()}

    ${context.getLocationContext()}
    </context>

    Your options:
     - search: Search the web for more information.
     - answer: Answer the user's question and complete the loop.
     
     Choose the most appropriate next action based on the context.
     Respond ONLY with a valid JSON object matching the schema. 
     Do not include any explanation or extra text.`,
  });
  return result.object;
};
