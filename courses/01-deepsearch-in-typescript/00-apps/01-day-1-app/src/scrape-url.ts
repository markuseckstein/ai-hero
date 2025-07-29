import { bulkCrawlWebsites } from "./server/scraper";
import type { ScrapeResult } from "./system-context";

export async function scrapeUrl(urls: string[]): Promise<ScrapeResult[]> {
  const crawlResults = await bulkCrawlWebsites({ urls });
  if (!crawlResults.success) {
    return crawlResults.results.map((r) => ({
      url: r.url,
      result: r.result.success
        ? r.result.data
        : `Error: ${(r.result as any).error}`,
    }));
  }
  return crawlResults.results.map((r) => ({
    url: r.url,
    result: r.result.data,
  }));
}
