import { evalite } from "evalite";
import { askDeepSearch } from "~/deep-search";
import type { Message } from "ai";
import { Factuality } from "./factuality.scorer";
import { MarkdownLinkScorer } from "./markdown-link.scorer";
import { AnswerRelevancy } from "./answer-relevancy.scorer";
import { devData } from "./dev";
import { ciData } from "./ci";
import { regressionData } from "./regression";
import { env } from "~/env";

let data = [...devData];
if (env.EVAL_DATASET === "ci") {
  data.push(...ciData);
} else if (env.EVAL_DATASET === "regression") {
  data.push(...ciData, ...regressionData);
}

evalite("Deep Search Eval", {
  data: () => data,
  task: async (input) => {
    const messages: Message[] = [
      {
        id: "1",
        role: "user",
        content: input,
      },
    ];
    const result = askDeepSearch(messages);
    console.log("askDeepSearch result:", result);
    return result;
  },
  scorers: [MarkdownLinkScorer, Factuality, AnswerRelevancy],
});
