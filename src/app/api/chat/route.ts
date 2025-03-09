import { GoogleGenerativeAI } from "@google/generative-ai";
import { db } from "@/lib/db";
import { chat, messages as _messages } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getContext } from "@/lib/context";
import { Message } from "ai";

export const runtime = "nodejs";

interface ChatRequestBody {
  messages: Message[];
  chatId: number;
}

export async function POST(req: Request): Promise<Response> {
  try {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Missing GOOGLE_API_KEY" }, { status: 500 });
    const genAI = new GoogleGenerativeAI(apiKey);

    let body: ChatRequestBody;
    try {
      body = await req.json() as ChatRequestBody;
    } catch (e) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const { messages, chatId } = body;
    if (!Array.isArray(messages) || !Number.isInteger(chatId)) {
      return NextResponse.json({ error: "Invalid messages or chatId" }, { status: 400 });
    }
    if (!messages.length) return NextResponse.json({ error: "No messages provided" }, { status: 400 });

    console.log("Received chatId:", chatId);
    console.log("Received messages:", messages);

    const _chats = await db.select().from(chat).where(eq(chat.id, chatId));
    if (_chats.length !== 1 || !_chats[0]) {
      console.error("Chat not found for chatId:", chatId);
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }
    const fileKey = _chats[0].fileKey;
    if (!fileKey) return NextResponse.json({ error: "Chat missing fileKey" }, { status: 500 });

    const lastMessage = messages[messages.length - 1];
    if (!lastMessage?.content) return NextResponse.json({ error: "Last message empty" }, { status: 400 });
    console.log("Last user message:", lastMessage);

    const context = await getContext(lastMessage.content, fileKey);
    console.log("Retrieved context:", context || "No context found");

    const systemPrompt = {
      role: "system",
      content: `AI assistant is a brand new, powerful, human-like artificial intelligence.
        START CONTEXT BLOCK
        ${context || "No context available"}
        END OF CONTEXT BLOCK
        If the context does not provide the answer, say, "I'm sorry, but I don’t know the answer to that question."`,
    };

    const userMessages = messages.filter((msg) => msg.role === "user");
    const combinedContent = [systemPrompt.content, ...userMessages.map((msg) => msg.content)].join("\n");

    console.log("Sending request to Gemini AI...");
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    let result;
    try {
      result = await model.generateContentStream(combinedContent);
    } catch (e) {
      console.error("Gemini API error:", e);
      return NextResponse.json({ error: "AI service unavailable" }, { status: 503 });
    }

    console.log("Streaming AI response...");
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let aiResponse = "";
        try {
          for await (const chunk of result.stream) {
            const text = typeof chunk.text === "function" ? chunk.text() : chunk.text || "";
            if (text) {
              console.log("AI Response Chunk:", text);
              const jsonChunk = JSON.stringify({ role: "assistant", content: text }) + "\n";
              controller.enqueue(encoder.encode(jsonChunk));
              aiResponse += text;
            } else {
              console.warn("Empty chunk received");
            }
          }
          try {
            await db.insert(_messages).values([
              { chatId, content: lastMessage.content, role: "user" },
              { chatId, content: aiResponse, role: "assistant" },
            ]);
          } catch (dbError) {
            console.error("DB insert failed:", dbError);
          }
          controller.close();
        } catch (streamError) {
          console.error("Stream error:", streamError);
          controller.error(streamError);
        }
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "application/x-ndjson" },
    });
  } catch (error) {
    console.error("Error in chat API:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}