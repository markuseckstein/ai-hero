import { z } from "zod";
import { generateObject } from "ai";
import { model } from "./model";
import type { IncomingMessage } from "http";

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

export class SystemContext {
  private step = 0;
  private queryHistory: QueryResult[] = [];
  private scrapeHistory: ScrapeResult[] = [];

  constructor(public readonly initialQuestion: string) {}

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

export interface SearchAction {
  type: "search";
  query: string;
}

export interface ScrapeAction {
  type: "scrape";
  urls: string[];
}

export interface AnswerAction {
  type: "answer";
}

export type Action = SearchAction | ScrapeAction | AnswerAction;

export const actionSchema = z.object({
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

export const getNextAction = async (context: SystemContext) => {
  const result = await generateObject({
    model,
    schema: actionSchema,
    system: `You are a helpful AI assistant that can search the web, scrape URLs, or answer questions. Your goal is to determine the next best action to take based on the current context.`,
    prompt: `
    <question>
      ${context.initialQuestion}
    </question>

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
