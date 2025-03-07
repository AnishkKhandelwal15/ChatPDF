import { NextResponse } from "next/server";
import { uploadToS3 } from "@/lib/s3";
import { loadS3IntoPinecone } from "@/lib/pinecone";
import { db } from "@/lib/db";
import { chat } from "@/lib/db/schema";
import { auth } from "@clerk/nextjs/server";
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    // Upload to S3
    const s3Data = await uploadToS3(file);
    if (!s3Data?.file_key || !s3Data.file_name) {
      return NextResponse.json({ error: "Failed to upload to S3" }, { status: 500 });
    }

    // Index in Pinecone
    await loadS3IntoPinecone(s3Data.file_key);

    // Create chat in database
    const [newChat] = await db
      .insert(chat)
      .values({
        userId,
        pdfName: s3Data.file_name,
        pdfUrl: `https://${process.env.NEXT_PUBLIC_S3_BUCKET_NAME}.s3.ap-south-1.amazonaws.com/${s3Data.file_key}`,
        fileKey: s3Data.file_key,
      })
      .returning();

    return NextResponse.json({ chat_id: newChat.id });
  } catch (error) {
    console.error("Upload and Index Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}