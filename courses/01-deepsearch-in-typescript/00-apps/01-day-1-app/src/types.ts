import type { Action } from "./system-context";

export type Usage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

type Source = {
  title: string;
  url: string;
  snippet: string;
  favicon?: string;
};

export type UsageRecord = {
  label: string;
  usage: Usage;
};

export type OurMessageAnnotation =
  | {
      type: "NEW_ACTION";
      action: Action;
    }
  | {
      type: "PLAN";
      plan: string;
      queries: string[];
    }
  | {
      type: "SOURCES";
      sources: Source[];
    }
  | {
      type: "USAGE";
      totalTokens: number;
    };
