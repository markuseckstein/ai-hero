import type { StreamTextResult, Message, streamText } from "ai";
import { answerQuestion } from "./answer-question";
import type { AnswerTone, UserLocation } from "./system-context";
import { SystemContext, getNextAction } from "./system-context";
import { queryRewriter } from "./query-rewriter";
import type { OurMessageAnnotation } from "./types";
import { searchSerper } from "./serper";
import { bulkCrawlWebsites } from "./server/scraper";
import { summarizeURL } from "./summarize-url";
import { env } from "./env";

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
    console.log(`----  Agent loop step ${ctx.currentStep} ----`);

    // Step 1: Plan and rewrite queries
    const { plan, queries } = await queryRewriter(ctx, {
      langfuseTraceId: opts.langfuseTraceId,
    });

    // Step 2: Search in parallel for all queries
    const searchResults = await Promise.all(
      queries.map(async (query) => {
        const results = await searchSerper(
          { q: query, num: env.SEARCH_RESULTS_COUNT },
          undefined,
        );
        return {
          query,
          results: results.organic.map((res) => ({
            date: res.date ?? new Date().toISOString(),
            title: res.title,
            url: res.link,
            snippet: res.snippet,
            summary: "", // summary will be filled after scraping
          })),
        };
      }),
    );

    // Step 3: Scrape and summarize each result
    for (const search of searchResults) {
      const crawlResults = await bulkCrawlWebsites({
        urls: search.results.map((r) => r.url),
      });
      for (const result of search.results) {
        const crawlData = crawlResults.success
          ? crawlResults.results.find((c) => c.url === result.url)
          : undefined;
        const scrapedContent = crawlData?.result.success
          ? crawlData.result.data
          : "Failed to scrape content";
        try {
          const summarizeResult = await summarizeURL({
            conversation: ctx.getMessageHistory(),
            scrapedContent,
            searchMetadata: {
              date: result.date,
              title: result.title,
              url: result.url,
              snippet: result.snippet,
            },
            query: search.query,
            langfuseTraceId: opts.langfuseTraceId,
          });
          result.summary = summarizeResult.summary;
        } catch (e) {
          result.summary = "Summarization failed.";
        }
      }
      ctx.reportSearch({ query: search.query, results: search.results });
    }

    // Step 4: Decide next action and store feedback
    const nextAction = await getNextAction(ctx, opts.langfuseTraceId);

    // Store feedback in context if provided
    if (nextAction.type === "continue" && nextAction.feedback) {
      ctx.setLastFeedback(nextAction.feedback);
    }

    if (opts.writeMessageAnnotation) {
      opts.writeMessageAnnotation({
        type: "NEW_ACTION",
        action: nextAction,
      });
    }
    if (nextAction.type === "answer") {
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
