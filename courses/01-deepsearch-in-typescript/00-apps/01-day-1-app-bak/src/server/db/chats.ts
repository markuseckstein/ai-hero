import type { Message } from "ai";
import { and, eq } from "drizzle-orm";
import { db } from ".";
import { chats, messages } from "./schema";

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
      where: eq(chats.id, opts.chatId),
    });

    if (existingChat) {
      // If chat exists, verify ownership
      if (existingChat.userId !== opts.userId) {
        throw new Error("Chat ID already exists for another user");
      }
    }
    if (existingChat) {
      // If chat exists, verify ownership
      const updateData: any = { updatedAt: new Date() };
      if (opts.title) updateData.title = opts.title;
      await tx
        .update(chats)
        .set(updateData)
        .where(and(eq(chats.id, opts.chatId), eq(chats.userId, opts.userId)));
    } else {
      await tx.insert(chats).values({
        id: opts.chatId,
        userId: opts.userId,
        title: opts.title ?? "Generating...",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    // Insert all messages
    if (opts.messages.length > 0) {
      await tx.insert(messages).values(
        opts.messages.map((message, index) => ({
          chatId: opts.chatId,
          role: message.role,
          parts: message.parts,
          annotations: message.annotations ?? [],
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
