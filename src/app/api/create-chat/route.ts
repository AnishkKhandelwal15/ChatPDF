import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { chat, messages as _messages } from "@/lib/db/schema";
import { auth } from "@clerk/nextjs/server";

const apiKey = process.env.GOOGLE_API_KEY;
if (!apiKey) throw new Error("GOOGLE_API_KEY is not defined");

const genAI = new GoogleGenerativeAI(apiKey);

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { file_key, file_name } = await req.json();
    if (!file_key || !file_name) {
      return NextResponse.json({ error: "Missing file_key or file_name" }, { status: 400 });
    }

    const [newChat] = await db
      .insert(chat)
      .values({
        userId,
        pdfName: file_name,
        pdfUrl: `https://${process.env.NEXT_PUBLIC_S3_BUCKET_NAME}.s3.ap-south-1.amazonaws.com/${file_key}`,
        fileKey: file_key,
      })
      .returning();

    return NextResponse.json({ chat_id: newChat.id });
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json({ error: "Failed to create chat" }, { status: 500 });
  }
}