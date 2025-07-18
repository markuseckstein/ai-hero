import { streamText, type Message, type TelemetrySettings } from "ai";
import { model } from "~/model";
import { searchSerper } from "./serper";
import { bulkCrawlWebsites } from "./server/scraper";
import z from "zod";


const formattingInstructions = `
# Markdown Link Formatting Instructions

You must format all links as inline markdown links using the exact syntax: \`[link text](URL)\`

**Requirements:**

- Always use inline link format, never reference-style links
- Link text should be descriptive and meaningful
- URLs must be complete and functional
- No spaces between the closing bracket \`]\` and opening parenthesis \`(\`
- Ensure proper escaping of special characters in URLs if needed

## Examples

<example1>
**Correct:** For more information about machine learning, visit the [Stanford AI course](https://cs229.stanford.edu/) which covers fundamental concepts.

**Incorrect:** For more information about machine learning, visit the Stanford AI course[1] which covers fundamental concepts.

[1]: https://cs229.stanford.edu/

</example1>

<example2>
**Correct:** The [OpenAI API documentation](https://platform.openai.com/docs) provides comprehensive guides for developers working with GPT models.

**Incorrect:** The OpenAI API documentation (https://platform.openai.com/docs) provides comprehensive guides for developers working with GPT models.
</example2>

<example3>
**Correct:** According to the [latest research paper](https://arxiv.org/abs/2103.00020), transformer architectures continue to show promising results in natural language processing tasks.

**Incorrect:** According to the latest research paper at https://arxiv.org/abs/2103.00020, transformer architectures continue to show promising results in natural language processing tasks.
</example3>

Follow this format consistently throughout your response.

`;


const generalInstructions = `You are a helpful AI assistant with access to real-time web search capabilities. When answering questions:

1. ALWAYS search the web for up-to-date information when relevant
2. Be thorough but concise in your responses
3. If you're unsure about something, search the web to verify
4. ALWAYS include the source where you found the information using markdown links
5. NEVER include raw URLs - ALWAYS use markdown link format [title](url)
6. When users ask for up-to-date information, use the current date to provide context about how recent the information is. The current date and time is: ${new Date().toLocaleString()}.
7. You have access to a tool called searchWeb. ALWAYS use searchWeb to find 10 relevant URLs from diverse sources (news sites, blogs, official documentation, etc.)
8. You have access to a tool called scrapePages. ALWAYS use scrapePages to extract the full text content of any web page you find in search results, not just the snippet. scrapePages takes a list of URLs and returns the full page content in markdown format. If scraping is not allowed, you will receive an error message for that URL.



Your workflow should be:
1. ALWAYS use searchWeb to find 10 relevant URLs from diverse sources (news sites, blogs, official documentation, etc.)
2. Select 4-6 of the most relevant and diverse URLs to scrape
3. ALWAYS use scrapePages to get full page content of those URLs
4. Use the full content to provide detailed, accurate answers

Remember to:
- Always scrape multiple sources (4-6) to ensure diverse perspectives
- use the searchWeb tool to get the full content of those URLs
- use the full content of a page to provide detailed, accurate answers
Also, always use the current date in your answers when users ask for up-to-date information.`;


const specialInstructions = `
For any information about football transfer news, prioritize sources from David Ornstein and Fabrizio Romano. If you can't find the information from them, use other sources.

If the user asks about a person and you don't know the answer, say that you don't know the answer and reply with a Chuck Norris joke.
`;

const systemPrompt = `${generalInstructions}
${formattingInstructions}
${specialInstructions}
`;

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
                    console.log("Searching web for query:", query);
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
                execute: async ({ urls }, { abortSignal }) => {
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
        onFinish: () => { }, // stub for evaluation
        telemetry: {
            isEnabled: false,
        },
    });
    await result.consumeStream();
    return await result.text;
}


