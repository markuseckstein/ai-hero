import type { StreamTextResult, Message, streamText } from "ai";
import { answerQuestion } from "./answer-question";
import { env } from "./env";
import { searchSerper } from "./serper";
import { bulkCrawlWebsites } from "./server/scraper";
import type {
  AnswerTone,
  QueryResult,
  ScrapeResult,
  UserLocation,
} from "./system-context";
import { SystemContext, getNextAction } from "./system-context";
import type { OurMessageAnnotation } from "./types";

// Copy-paste of searchWeb tool logic
export async function searchWeb(query: string): Promise<QueryResult> {
  const results = await searchSerper(
    { q: query, num: env.SEARCH_RESULTS_COUNT },
    undefined,
  );
  return {
    query,
    results: results.organic.map((result) => ({
      title: result.title,
      url: result.link,
      snippet: result.snippet,
      date: result.date ?? "", // ensure string
    })),
  };
}

// Copy-paste of scrapePages tool logic
export async function scrapeUrl(urls: string[]): Promise<ScrapeResult[]> {
  const crawlResults = await bulkCrawlWebsites({ urls });
  if (!crawlResults.success) {
    return crawlResults.results.map((r) => ({
      url: r.url,
      result: r.result.success
        ? r.result.data
        : `Error: ${(r.result as any).error}`,
    }));
  }
  return crawlResults.results.map((r) => ({
    url: r.url,
    result: r.result.data,
  }));
}

export async function runAgentLoop(
  messages: Message[],
  opts: {
    writeMessageAnnotation: (annotation: OurMessageAnnotation) => void;
    tone: AnswerTone;
    langfuseTraceId?: string;
    onFinish: Parameters<typeof streamText>[0]["onFinish"];
    userLocation: UserLocation;
  },
): Promise<StreamTextResult<{}, string>> {
  const ctx = new SystemContext(messages, opts.tone, opts.userLocation);
  console.log(
    `Starting agent loop with initial message: "${messages[messages.length - 1]?.content ?? ""}"`,
  );
  while (!ctx.shouldStop()) {
    const nextAction = await getNextAction(ctx, opts.langfuseTraceId);

    if (opts.writeMessageAnnotation) {
      opts.writeMessageAnnotation({
        type: "NEW_ACTION",
        action: nextAction,
      });
    }

    if (nextAction.type === "search" && nextAction.query) {
      const result = await searchWeb(nextAction.query);
      ctx.reportQueries([result]);
    } else if (nextAction.type === "scrape" && nextAction.urls) {
      const result = await scrapeUrl(nextAction.urls);
      ctx.reportScrapes(result);
    } else if (nextAction.type === "answer") {
      return answerQuestion(ctx, {
        langfuseTraceId: opts.langfuseTraceId,
        onFinish: opts.onFinish,
      });
    }
    ctx.incrementStep();
  }
  return answerQuestion(ctx, {
    isFinal: true,
    langfuseTraceId: opts.langfuseTraceId,
    onFinish: opts.onFinish,
  });
}
