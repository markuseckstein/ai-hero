import { and, eq } from "drizzle-orm";
import type { Message } from "ai";
import { db } from ".";
import { chats, messages, type DB } from "./schema";

export const upsertChat = async (opts: {
  userId: string;
  chatId: string;
  title: string;
  messages: Message[];
}) => {
  // Start a transaction since we need to handle both chat and messages
  return await db.transaction(async (tx) => {
    // First, try to find the existing chat
    const existingChat = await tx.query.chats.findFirst({
      where: and(eq(chats.id, opts.chatId), eq(chats.userId, opts.userId)),
    });

    if (existingChat) {
      // If chat exists, verify ownership
      if (existingChat.userId !== opts.userId) {
        throw new Error("Chat ID already exists for another user");
      }

      // Update the chat title and timestamps
      await tx
        .update(chats)
        .set({
          title: opts.title,
          updatedAt: new Date(),
        })
        .where(eq(chats.id, opts.chatId));

      // Delete all existing messages
      await tx.delete(messages).where(eq(messages.chatId, opts.chatId));
    } else {
      // Create a new chat
      await tx.insert(chats).values({
        id: opts.chatId,
        userId: opts.userId,
        title: opts.title,
      });
    }

    // Insert all messages
    if (opts.messages.length > 0) {
      await tx.insert(messages).values(
        opts.messages.map((message, index) => ({
          chatId: opts.chatId,
          role: message.role,
          parts: message.parts,
          order: index,
        })),
      );
    }

    return { success: true };
  });
};

export const getChat = async (opts: { userId: string; chatId: string }) => {
  const chat = await db.query.chats.findFirst({
    where: and(eq(chats.id, opts.chatId), eq(chats.userId, opts.userId)),
    with: {
      messages: {
        orderBy: (messages, { asc }) => [asc(messages.order)],
      },
    },
  });

  if (!chat) {
    return null;
  }

  return {
    ...chat,
    messages: chat.messages.map((message) => ({
      role: message.role,
      content: message.parts,
      id: message.id.toString(),
    })),
  };
};

export const getChats = async (opts: { userId: string }) => {
  return await db.query.chats.findMany({
    where: eq(chats.userId, opts.userId),
    orderBy: (chats, { desc }) => [desc(chats.updatedAt)],
  });
};
