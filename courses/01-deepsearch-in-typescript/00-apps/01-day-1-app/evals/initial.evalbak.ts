import { evalite } from "evalite";
import { askDeepSearch } from "~/deep-search";
import type { Message } from "ai";

evalite("Deep Search Eval", {
  data: async (): Promise<{ input: Message[] }[]> => {
    return [
      {
        input: [
          {
            id: "1",
            role: "user",
            content: "What is the latest version of TypeScript?",
          },
        ],
      },
      {
        input: [
          {
            id: "2",
            role: "user",
            content: "What are the main features of Next.js 15?",
          },
        ],
      },
      {
        input: [
          {
            id: "3",
            role: "user",
            content: "List three popular React UI libraries.",
          },
        ],
      },
      {
        input: [
          {
            id: "4",
            role: "user",
            content: "Who maintains the Drizzle ORM project?",
          },
        ],
      },
      {
        input: [
          {
            id: "5",
            role: "user",
            content:
              "Summarize the main differences between Next.js and Remix.",
          },
        ],
      },
      {
        input: [
          {
            id: "6",
            role: "user",
            content: "What is the purpose of the evalite framework?",
          },
        ],
      },
    ];
  },
  task: async (input) => {
    return askDeepSearch(input);
  },
  scorers: [
    {
      name: "Contains Links",
      description: "Checks if the output contains any markdown links.",
      scorer: ({ output }) => {
        // Markdown link: [text](url)
        const containsLinks = /\[[^\]]+\]\([^\)]+\)/.test(output);
        return containsLinks ? 1 : 0;
      },
    },
  ],
});
