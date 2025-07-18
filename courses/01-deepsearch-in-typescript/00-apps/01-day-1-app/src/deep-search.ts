import { streamText, type Message, type TelemetrySettings } from "ai";
import { model } from "~/model";
import { searchSerper } from "./serper";
import { bulkCrawlWebsites } from "./server/scraper";
import z from "zod";

const systemPrompt = `You are a helpful AI assistant with access to real-time web search capabilities. When answering questions:

1. Always search the web for up-to-date information when relevant
2. ALWAYS format URLs as markdown links using the format [title](url)
3. Be thorough but concise in your responses
4. If you're unsure about something, search the web to verify
5. When providing information, always include the source where you found it using markdown links
6. Never include raw URLs - always use markdown link format
7. When users ask for up-to-date information, use the current date to provide context about how recent the information is. The current date and time is: ${new Date().toLocaleString()}.
8. You have access to a tool called scrapePages. ALWAYS use scrapePages to extract the full text content of any web page you find in search results, not just the snippet. scrapePages takes a list of URLs and returns the full page content in markdown format. If scraping is not allowed, you will receive an error message for that URL.

Your workflow should be:
1. Use searchWeb to find 10 relevant URLs from diverse sources (news sites, blogs, official documentation, etc.)
2. Select 4-6 of the most relevant and diverse URLs to scrape
3. Use scrapePages to get full page content of those URLs
3. Use the full content to provide detailed, accurate answers

Remember to:
- Always scrape multiple sources (4-6) to ensure diverse perspectives
- use the searchWeb tool to get the full content of those URLs
- use the full content of a page to provide detailed, accurate answers
Also, always use the current date in your answers when users ask for up-to-date information.`;



export const streamFromDeepSearch = (opts: {
  messages: Message[];
  onFinish: Parameters<typeof streamText>[0]["onFinish"];
  telemetry: TelemetrySettings;
}) =>
  streamText({
    model,
    messages: opts.messages,
    maxSteps: 10,
    system: systemPrompt,
    tools: {
          searchWeb: {
            parameters: z.object({
              query: z.string().describe("The query to search the web for"),
            }),
            execute: async ({ query }, { abortSignal }) => {
              const results = await searchSerper(
                { q: query, num: 10 },
                abortSignal,
              );
              return results.organic.map((result) => ({
                title: result.title,
                link: result.link,
                snippet: result.snippet,
                date: result.date,
              }));
            },
          },
          scrapePages: {
            parameters: z.object({
              urls: z.array(z.string()).describe("List of URLs to scrape for full page content in markdown format"),
            }),
            execute: async ({ urls }) => {
              const crawlResults = await bulkCrawlWebsites({ urls });
              if (!crawlResults.success) {
                return {
                  error: crawlResults.error,
                  results: crawlResults.results.map(r => (
                    {
                      url: r.url,
                      data: r.result.success ? r.result.data : `Error: ${(r.result as any).error}`,
                    }))
                }

              }
              return {
                results: crawlResults.results.map(r => ({
                  url: r.url,
                  data: r.result.data
                }))
              }
            },
          },
        },
    onFinish: opts.onFinish,
    experimental_telemetry: opts.telemetry,
  });

export async function askDeepSearch(messages: Message[]) {
  const result = streamFromDeepSearch({
    messages,
    onFinish: () => {}, // stub for evaluation
    telemetry: {
      isEnabled: false,
    },
  });
  await result.consumeStream();
  return await result.text;
}


