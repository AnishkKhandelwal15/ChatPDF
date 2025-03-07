import { GoogleGenerativeAI } from "@google/generative-ai";
import { db } from "@/lib/db";
import { chat, messages as _messages } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getContext } from "@/lib/context";
import { Message } from "ai";

export const runtime = "nodejs";

const apiKey = process.env.GOOGLE_API_KEY;
if (!apiKey) throw new Error("GOOGLE_API_KEY is not defined");

console.log("GOOGLE_API_KEY is set:", !!apiKey);

const genAI = new GoogleGenerativeAI(apiKey);

interface ChatRequestBody {
  messages: Message[];
  chatId: number;
}

export async function POST(req: Request): Promise<Response> {
  try {
    const { messages, chatId } = await req.json() as ChatRequestBody;

    console.log("Received chatId:", chatId);
    console.log("Received messages:", messages);

    const _chats = await db.select().from(chat).where(eq(chat.id, chatId));
    console.log("Fetched chat details:", _chats);

    if (_chats.length !== 1) {
      console.error("Chat not found for chatId:", chatId);
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    const fileKey = _chats[0].fileKey;
    const lastMessage = messages[messages.length - 1];
    console.log("Last user message:", lastMessage);

    const context = await getContext(lastMessage.content, fileKey);
    console.log("Retrieved context:", context);

    const systemPrompt = {
      role: "system",
      content: `AI assistant is a brand new, powerful, human-like artificial intelligence.
      START CONTEXT BLOCK
      ${context}
      END OF CONTEXT BLOCK
      If the context does not provide the answer, say, "I'm sorry, but I don't know the answer to that question."`,
    };

    const userMessages = messages.filter((message: Message) => message.role === "user");
    const combinedContent = [systemPrompt.content, ...userMessages.map((msg) => msg.content)].join("\n");

    console.log("Sending request to Gemini AI...");

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    const result = await model.generateContentStream(combinedContent);

    console.log("Streaming AI response...");

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let aiResponse = "";
        try {
          for await (const chunk of result.stream) {
            const text = chunk.text?.() || "";
            if (text) {
              console.log("AI Response Chunk:", text);
              // Stream as JSON for useChat compatibility
              const jsonChunk = JSON.stringify({ role: "assistant", content: text }) + "\n";
              controller.enqueue(encoder.encode(jsonChunk));
              aiResponse += text;
            }
          }
          await db.insert(_messages).values([
            { chatId, content: lastMessage.content, role: "user" as const },
            { chatId, content: aiResponse, role: "assistant" as const },
          ]);
          controller.close();
        } catch (streamError) {
          console.error("Stream error:", streamError);
          controller.error(streamError);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8", // Still works with JSON chunks
      },
    });
  } catch (error) {
    console.error("Error in chat API:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}