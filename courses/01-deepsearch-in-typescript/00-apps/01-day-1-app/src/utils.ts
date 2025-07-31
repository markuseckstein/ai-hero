export function isNewChatCreated(data: unknown): data is {
  type: "NEW_CHAT_CREATED";
  chatId: string;
} {
  return (
    typeof data === "object" &&
    data !== null &&
    "type" in data &&
    data.type === "NEW_CHAT_CREATED" &&
    "chatId" in data &&
    typeof (data as any).chatId === "string"
  );
}

/**
 * Format a number with comma separators
 */
export function formatNumber(num: number): string {
  return num.toLocaleString();
}
