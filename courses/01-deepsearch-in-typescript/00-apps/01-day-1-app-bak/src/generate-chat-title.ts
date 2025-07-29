import { generateText } from "ai";
import { chatTitleModel } from "~/model";
import type { Message } from "ai";

// Generates a chat title using the LLM
export const generateChatTitle = async (messages: Message[]) => {
  console.log("Generating chat title for messages:", messages);
  const { text } = await generateText({
    model: chatTitleModel,
    system: `You are a chat title generator.
      You will be given a chat history, and you will need to generate a title for the chat.
      The title should be a single sentence that captures the essence of the chat.
      The title should be no more than 50 characters.
      The title should be in the same language as the chat history.
      `,
    prompt: `Here is the chat history:

      ${messages.map((m) => m.content).join("\n")}
    `,
  }).then((result) => {
    console.log("Generated chat title:", result.text);
    return result;
  });
  return text;
};
