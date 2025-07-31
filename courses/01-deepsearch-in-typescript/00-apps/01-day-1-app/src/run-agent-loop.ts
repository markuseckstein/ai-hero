import { streamText, type StreamTextResult, type Message } from "ai";
import { answerQuestion } from "./answer-question";
import type { AnswerTone, UserLocation } from "./system-context";
import { SystemContext, getNextAction } from "./system-context";
import { queryRewriter } from "./query-rewriter";
import type { OurMessageAnnotation } from "./types";
import { searchSerper } from "./serper";
import { bulkCrawlWebsites } from "./server/scraper";
import { summarizeURL } from "./summarize-url";
import { env } from "./env";
import { checkIsSafe } from "./guardrails";
import { clarificationModel, model } from "./model";
import { checkIfQuestionNeedsClarification } from "./check-question-clarity";

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

  // Guardrail check before entering the main loop
  const guardrailResult = await checkIsSafe(ctx, {
    langfuseTraceId: opts.langfuseTraceId,
  });
  if (guardrailResult.classification === "refuse") {
    // Return a refusal message as a streamText result
    return streamText({
      model,
      system:
        "You are a content safety guardrail. Refuse to answer unsafe questions.",
      prompt:
        guardrailResult.reason ||
        "I apologize, but I cannot assist with that request as it may be unsafe or inappropriate.",
      onFinish: opts.onFinish,
      experimental_telemetry: opts.langfuseTraceId
        ? {
            isEnabled: true,
            functionId: "guardrail-refuse-response",
            metadata: {
              langfuseTraceId: opts.langfuseTraceId,
            },
          }
        : undefined,
    });
  }

  // Check if the question needs clarification
  const clarificationResult = await checkIfQuestionNeedsClarification(ctx, {
    langfuseTraceId: opts.langfuseTraceId,
  });

  if (clarificationResult.needsClarification) {
    return streamText({
      model: clarificationModel,
      system: `You are a clarification agent. Your job is to ask the user for clarification on their question.
      
Key Guidelines:
- Be polite and friendly
- Ask specific questions to get the needed clarification
- Explain briefly why the clarification will help provide a better answer
- Keep your response concise`,
      prompt: `Here is the message history:

${ctx.getMessageHistory()}

And here is why the question needs clarification:

${clarificationResult.reason}

Please reply to the user with a clarification request.`,
      onFinish: opts.onFinish,
      experimental_telemetry: opts.langfuseTraceId
        ? {
            isEnabled: true,
            functionId: "clarification-request-response",
            metadata: {
              langfuseTraceId: opts.langfuseTraceId,
            },
          }
        : undefined,
    });
  }

  // Track which steps have sent source annotations
  const sourcesAnnotationsSent = new Set<number>();
  console.log(
    `Starting agent loop with initial message: "${messages[messages.length - 1]?.content ?? ""}"`,
  );
  while (!ctx.shouldStop()) {
    console.log(`----  Agent loop step ${ctx.currentStep} ----`);

    // Step 1: Plan and rewrite queries
    const { plan, queries } = await queryRewriter(ctx, {
      langfuseTraceId: opts.langfuseTraceId,
    });

    // Send plan annotation
    if (opts.writeMessageAnnotation) {
      opts.writeMessageAnnotation({
        type: "PLAN",
        plan,
        queries,
      });
    }

    // Step 2: Search in parallel for all queries
    const searchResults = await Promise.all(
      queries.map(async (query) => {
        const results = await searchSerper(
          { q: query, num: env.SEARCH_RESULTS_COUNT },
          undefined,
        );

        // Collect sources early
        const sources = results.organic.map((res) => {
          const url = new URL(res.link);
          return {
            title: res.title,
            url: res.link,
            snippet: res.snippet,
            favicon: `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=128`,
          };
        });

        // Send sources annotation only once per step
        if (
          opts.writeMessageAnnotation &&
          !sourcesAnnotationsSent.has(ctx.currentStep)
        ) {
          opts.writeMessageAnnotation({
            type: "SOURCES",
            sources,
          });
          sourcesAnnotationsSent.add(ctx.currentStep);
        }

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
