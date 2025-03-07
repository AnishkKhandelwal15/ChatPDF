
import ChatComponent from "@/components/ui/ChatComponent";
import ChatSideBar from "@/components/ui/ChatSideBar";
import PDFViewer from "@/components/ui/PDFViewer";
import { db } from "@/lib/db";
import { chat } from "@/lib/db/schema";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import React from "react";
import { Suspense } from "react";

type Props = {
  params: Promise<{ chatId?: string }>;
};

const ChatPage = async ({ params }: Props) => {
  const resolvedParams = await params;

  if (!resolvedParams?.chatId) {
    return redirect("/");
  }

  const chatId = resolvedParams.chatId;

  const { userId } = await auth();
  if (!userId) {
    return redirect("/sign-in");
  }

  // Fetch user chats from the database
  const _chats = await db.select().from(chat).where(eq(chat.userId, userId));

  // Redirect if user has no chats
  if (_chats.length === 0) {
    return redirect("/");
  }

  // Convert chatId to an integer safely
  const chatIdNumber = parseInt(chatId, 10);
  if (isNaN(chatIdNumber)) {
    return redirect("/");
  }

  // Check if chat exists in user's chats
  if (!_chats.some((chat) => chat.id === chatIdNumber)) {
    return redirect("/");
  }

  // Find the current chat
  const currentChat = _chats.find((chat) => chat.id === chatIdNumber);
// ... other imports and code ...

return (
  <div className="flex max-h-screen overflow-hidden">
    <div className="flex w-full max-h-screen overflow-hidden">
      {/* Chat Sidebar */}
      <div className="flex-[1] max-w-xs">
        <ChatSideBar chats={_chats} chatId={chatIdNumber} />
      </div>

      {/* PDF Viewer */}
      <div className="max-h-screen p-4 overflow-y-auto flex-[4]">
        <PDFViewer pdf_url={currentChat?.pdfUrl || ""} />
      </div>

      {/* Chat Component */}
      <div className="flex-[3] border-l-4 border-l-slate-200">
        <Suspense fallback={<div>Loading chat...</div>}>
          <ChatComponent chatId={chatIdNumber} />
        </Suspense>
      </div>
    </div>
  </div>
);
};
export default ChatPage;