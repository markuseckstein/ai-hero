import type { Action } from "./system-context";

type Source = {
  title: string;
  url: string;
  snippet: string;
  favicon?: string;
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
    };
