import { integer, pgEnum, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

// Updated to include 'assistant'
export const userSystemEnum = pgEnum('user_system_enum', ['system', 'user', 'assistant']);

export const chat = pgTable("chat", {
  id: serial('id').primaryKey(),
  pdfName: text('pdfName').notNull(),
  pdfUrl: text('pdfUrl').notNull(),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  userId: varchar('userId', { length: 256 }).notNull(),
  fileKey: text('fileKey').notNull(),
});

export type DrizzleChat = typeof chat.$inferSelect;

export const messages = pgTable("messages", {
  id: serial('id').primaryKey(),
  chatId: integer('chatId').references(() => chat.id).notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  role: userSystemEnum('role').notNull(),
});