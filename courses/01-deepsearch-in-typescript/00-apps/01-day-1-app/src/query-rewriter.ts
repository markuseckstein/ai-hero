import { generateObject } from "ai";
import { z } from "zod";
import { model } from "./model";
import type { SystemContext } from "./system-context";

export const queryRewriteSchema = z.object({
  plan: z
    .string()
    .describe(
      "A detailed research plan, outlining the logical progression of information needed.",
    ),
  queries: z
    .array(z.string())
    .min(1)
    .max(5)
    .describe(
      "A numbered list of 3-5 sequential search queries, specific and focused, written in natural language.",
    ),
});

export type QueryRewriteResult = z.infer<typeof queryRewriteSchema>;

export const queryRewriter = async (
  context: SystemContext,
  opts: { langfuseTraceId?: string } = {},
): Promise<QueryRewriteResult> => {
  const result = await generateObject({
    model,
    schema: queryRewriteSchema,
    system: `You are a strategic research planner with expertise in breaking down complex questions into logical search steps. Your primary role is to create a detailed research plan before generating any search queries.`,
    prompt: `First, analyze the question thoroughly:
- Break down the core components and key concepts
- Identify any implicit assumptions or context needed
- Consider what foundational knowledge might be required
- Think about potential information gaps that need filling

Then, develop a strategic research plan that:
- Outlines the logical progression of information needed
- Identifies dependencies between different pieces of information
- Considers multiple angles or perspectives that might be relevant
- Anticipates potential dead-ends or areas needing clarification

Finally, translate this plan into a numbered list of 3-5 sequential search queries that:
- Are specific and focused (avoid broad queries that return general information)
- Are written in natural language without Boolean operators (no AND/OR)
- Progress logically from foundational to specific information
- Build upon each other in a meaningful way

Message History:
${context.getMessageHistory()}

Search History:
${context.getSearchHistory()}

${context.getLastFeedback() ? `Previous Search Feedback:\n${context.getLastFeedback()}` : ""}

Location Context:
${context.getLocationContext()}


First User Message:
${context.getFirstUserMessage()}
`,
    experimental_telemetry: opts.langfuseTraceId
      ? {
          isEnabled: true,
          functionId: "query-rewriter",
          metadata: { langfuseTraceId: opts.langfuseTraceId },
        }
      : undefined,
  });

  console.log("Query rewriter returned", result.object);
  return result.object;
};
