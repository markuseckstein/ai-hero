import { z } from "zod";
import { generateObject, type Message } from "ai";
import { model } from "./model";

// type QueryResultSearchResult = {
//   date: string;
//   title: string;
//   url: string;
//   snippet: string;
// };

// export type QueryResult = {
//   query: string;
//   results: QueryResultSearchResult[];
// };

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

// const toQueryResult = (query: QueryResultSearchResult) =>
//   [`### ${query.date} - ${query.title}`, query.url, query.snippet].join("\n\n");

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

  reportSearch(search: SearchHistoryEntry) {
    this.searchHistory.push(search);
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

  // reportQueries(queries: QueryResult[]) {
  //   this.queryHistory.push(...queries);
  // }

  // reportScrapes(scrapes: ScrapeResult[]) {
  //   this.scrapeHistory.push(...scrapes);
  // }

  // getQueryHistory(): string {
  //   return this.queryHistory
  //     .map((query) =>
  //       [
  //         `## Query: \"${query.query}\"`,
  //         ...query.results.map(toQueryResult),
  //       ].join("\n\n"),
  //     )
  //     .join("\n\n");
  // }

  // getScrapeHistory(): string {
  //   return this.scrapeHistory
  //     .map((scrape) =>
  //       [
  //         `## Scrape: \"${scrape.url}\"`,
  //         `<scrape_result>`,
  //         scrape.result,
  //         `</scrape_result>`,
  //       ].join("\n\n"),
  //     )
  //     .join("\n\n");
  // }
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
    system: `You are a research query optimizer. Your task is to analyze search results against the original research goal and either decide to answer the question or to search for more information.`,
    prompt: `Message History:
${context.getMessageHistory()}

Based on this context, choose the next action:
1. If you need more information, use 'continue' and provide detailed feedback about what's missing.
2. If you have enough information to answer the question, use 'answer'.

Remember:
- Only use 'continue' if you need more information, and provide detailed feedback.
- Use 'answer' when you have enough information to provide a complete answer.
- Feedback is only required when choosing 'continue'.

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
