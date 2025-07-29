import type { Action } from "./system-context";

export type OurMessageAnnotation = {
  type: "NEW_ACTION";
  action: Action;
};
