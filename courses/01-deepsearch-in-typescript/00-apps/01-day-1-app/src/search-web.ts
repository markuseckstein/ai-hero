import { env } from "./env";
import { searchSerper } from "./serper";
import type { QueryResult } from "./system-context";

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
