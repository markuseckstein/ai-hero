import type { Evalite } from "evalite";

export const MarkdownLinkScorer = <Evalite.ScorerOpts<string, string, string> | Evalite.Scorer<string, string, string>> {
      name: "Contains Links",
      description: "Checks if the output contains any markdown links.",
      scorer: ({ output }) => {
        // Markdown link: [text](url)
        const containsLinks = /\[[^\]]+\]\([^\)]+\)/.test(output);
        return containsLinks ? 1 : 0;
      },
    };