import { z } from "zod";
import { generateObject, type Message } from "ai";
import { model } from "./model";

type QueryResultSearchResult = {
  date: string;
  title: string;
  url: string;
  snippet: string;
};

export type QueryResult = {
  query: string;
  results: QueryResultSearchResult[];
};

export type ScrapeResult = {
  url: string;
  result: string;
};

const toQueryResult = (query: QueryResultSearchResult) =>
  [`### ${query.date} - ${query.title}`, query.url, query.snippet].join("\n\n");

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
  private queryHistory: QueryResult[] = [];
  private scrapeHistory: ScrapeResult[] = [];
  private readonly messages: Message[];

  constructor(
    messages: Message[],
    public readonly tone: AnswerTone,
    location?: UserLocation,
  ) {
    this.messages = messages;
    this.location = location;
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
    return this.step >= 10;
  }

  incrementStep() {
    this.step++;
  }

  get currentStep() {
    return this.step;
  }

  reportQueries(queries: QueryResult[]) {
    this.queryHistory.push(...queries);
  }

  reportScrapes(scrapes: ScrapeResult[]) {
    this.scrapeHistory.push(...scrapes);
  }

  getQueryHistory(): string {
    return this.queryHistory
      .map((query) =>
        [
          `## Query: \"${query.query}\"`,
          ...query.results.map(toQueryResult),
        ].join("\n\n"),
      )
      .join("\n\n");
  }

  getScrapeHistory(): string {
    return this.scrapeHistory
      .map((scrape) =>
        [
          `## Scrape: \"${scrape.url}\"`,
          `<scrape_result>`,
          scrape.result,
          `</scrape_result>`,
        ].join("\n\n"),
      )
      .join("\n\n");
  }
}

export const actionSchema = z.object({
  title: z
    .string()
    .describe(
      "The title of the action, to be displayed in the UI. Be extremely concise. 'Searching Saka's injury history', 'Checking HMRC industrial action', 'Comparing toaster ovens'",
    ),
  reasoning: z.string().describe("The reason you chose this step."),
  type: z.enum(["search", "scrape", "answer"]).describe(
    `The type of action to take.
       - 'search': Search the web for more information.
       - 'scrape': Scrape a URL.
       - 'answer': Answer the user's question and complete the loop.`,
  ),
  query: z
    .string()
    .describe(
      "The query to search for. Required if type is 'search', otherwise omit this field.",
    )
    .optional(),
  urls: z
    .array(z.string())
    .describe(
      "The URLs to scrape. Required if type is 'scrape', otherwise omit this field.",
    )
    .optional(),
});

export type Action = z.infer<typeof actionSchema>;

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
    system: `You are a helpful AI assistant that can search the web, scrape URLs, or answer questions. Your goal is to determine the next best action to take based on the current context.`,
    prompt: `
    Message History:
      ${context.getMessageHistory()}

    ${context.getLocationContext()}

    Based on this context, choose the next action:

    1. If you need more information, use "search" with a relevant query
    2. If you have URLs that need to be scraped, use "scrape" with those URLs
    3. If you have enough information to answer the question, use "answer"

    Remember:
    - Only use "search" if you need more information
    - Only use "scrape" if you have URLs to scrape
    - Use "answer" when you have enough information to provide a complete answer

Here is the context:

    <context>
    ${context.getQueryHistory()}

    ${context.getScrapeHistory()}

    ${context.getLocationContext()}
    </context>

    Your options:
     - search: Search the web for more information.
     - scrape: Scrape one or more URLs for full content.
     - answer: Answer the user's question and complete the loop.
     
     Choose the most appropriate next action based on the context.
     Respond ONLY with a valid JSON object matching the schema. 
     Do not include any explanation or extra text.`,
  });
  return result.object;
};
