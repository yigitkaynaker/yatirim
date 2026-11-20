import type { Metadata } from "next";
import { ChatView } from "@/components/ChatView";

export const metadata: Metadata = { title: "Sohbet" };

// Claude ile araç kullanan sohbet. Araçlar src/lib/chatTools.ts içinde, eylem katmanını kullanır.
export default function ChatPage() {
  return <ChatView />;
}
