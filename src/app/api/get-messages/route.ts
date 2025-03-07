import { db } from "@/lib/db";
import { messages as _messages } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    console.log("Received body in /api/get-messages:", body); // Debug log
    const { chatId } = body;

    if (!chatId) {
      console.error("No chatId provided in request body");
      return NextResponse.json({ error: "chatId is required" }, { status: 400 });
    }

    const messages = await db
      .select()
      .from(_messages)
      .where(eq(_messages.chatId, chatId))
      .orderBy(_messages.createdAt);

    return NextResponse.json(
      messages.map((msg) => ({
        id: msg.id.toString(),
        role: msg.role,
        content: msg.content,
      }))
    );
  } catch (error) {
    console.error("Error fetching messages:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}