import type { Metadata } from "next";
import { NewsView } from "@/components/NewsView";

export const metadata: Metadata = { title: "Analizler" };

export default function NewsPage() {
  return <NewsView />;
}
