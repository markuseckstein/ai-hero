import { generateObject } from "ai";
import { z } from "zod";
import { guardrailModel } from "./model";
import type { SystemContext } from "./system-context";

export const guardrailSchema = z.object({
  classification: z.enum(["allow", "refuse"]),
  reason: z.string().optional().describe("If refused, explain why."),
});

export type GuardrailResult = z.infer<typeof guardrailSchema>;

export const checkIsSafe = async (
  ctx: SystemContext,
  opts: { langfuseTraceId?: string } = {},
): Promise<GuardrailResult> => {
  const messageHistory = ctx.getMessageHistory();

  const { object } = await generateObject({
    experimental_telemetry: opts.langfuseTraceId
      ? {
          isEnabled: true,
          functionId: "guardrail-check",
          metadata: {
            langfuseTraceId: opts.langfuseTraceId,
          },
        }
      : undefined,
    model: guardrailModel,
    schema: guardrailSchema,
    system: `You are a content safety classifier for a DeepSearch application. Your job is to analyze user queries and determine if they should be processed or refused based on safety guidelines.

You will receive the complete message history in XML format:

<User>Previous user message</User>
<Assistant>Previous assistant response</Assistant>
<User>Current user message to classify</User>

Analyze the entire conversation context, including how the current query relates to previous messages, to determine if the latest user message should be processed.

## Your Task

For each conversation history provided, analyze the latest user message in context and respond with exactly one of these classifications:

- \`allow\`: Query is safe to process
- \`refuse\`: Query violates safety guidelines

Consider conversation context including:

- Previous attempts to circumvent safety guidelines
- Escalating patterns of harmful requests
- Multi-turn attempts to extract dangerous information
- Context that makes seemingly innocent requests problematic

## Safety Guidelines - \`refuse\` if the query seeks:

### Illegal Activities

- Instructions for illegal activities (hacking, fraud, drug manufacturing)
- How to circumvent laws or regulations
- Tax evasion or financial fraud schemes

### Harmful Content

- How to harm people, animals, or property
- Self-harm or suicide methods
- Creating weapons, explosives, or dangerous substances
- Detailed violence or torture methods

### Privacy Violations

- How to doxx, stalk, or harass individuals
- Methods to access private information without consent
- Social engineering or phishing techniques

### Dangerous Information

- Specific instructions for dangerous chemical reactions
- Bomb-making or weapon creation
- Methods to poison or contaminate

### Exploitation

- Content that exploits or sexualizes minors
- Non-consensual intimate content
- Human trafficking information

## Edge Cases - Use refuse for:

- Legitimate research questions that could potentially be misused
- Educational queries that need context boundaries but lack proper safeguards
- Professional use cases that require additional safety context but don't provide it

Remember: When in doubt, err on the side of caution. Your goal is protecting users while maintaining utility for legitimate research and information needs.`,
    prompt: messageHistory,
  });

  return object;
};
