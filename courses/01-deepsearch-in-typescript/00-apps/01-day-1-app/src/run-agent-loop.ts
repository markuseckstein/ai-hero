import type { StreamTextResult } from "ai";
import { answerQuestion } from "./answer-question";
import { env } from "./env";
import { searchSerper } from "./serper";
import { bulkCrawlWebsites } from "./server/scraper";
import type { AnswerTone, QueryResult, ScrapeResult } from "./system-context";
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
  initialQuestion: string,
  opts: {
    writeMessageAnnotation: (annotation: OurMessageAnnotation) => void;
    tone: AnswerTone;
  },
): Promise<StreamTextResult<{}, string>> {
  const ctx = new SystemContext(initialQuestion, opts.tone);
  console.log(
    `Starting agent loop with initial question: "${initialQuestion}"`,
  );
  while (!ctx.shouldStop()) {
    const nextAction = await getNextAction(ctx);

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
      return answerQuestion(ctx);
    }
    ctx.incrementStep();
  }
  return answerQuestion(ctx, { isFinal: true });
}
