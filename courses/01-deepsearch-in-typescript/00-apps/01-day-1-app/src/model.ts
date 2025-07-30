import { google } from "@ai-sdk/google";

export const model = google("gemini-2.5-flash");

export const factualityModel = google("gemini-2.5-flash-lite");

export const chatTitleModel = google("gemini-2.5-flash-lite");

// Use Google Gemini 2.0 Flash Lite for summarization
export const summarizerModel = google("gemini-2.0-flash-lite");

// Use Google Gemini 2.0 Flash for quick, reliable content safety checks
export const guardrailModel = google("gemini-2.0-flash-001");
