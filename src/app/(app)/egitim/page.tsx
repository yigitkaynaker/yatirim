import type { Metadata } from "next";
import { EgitimIndex } from "@/components/egitim/EgitimIndex";
import { LESSON_SUMMARIES } from "@/content/egitim";

export const metadata: Metadata = { title: "Öğretici Analiz Desteği" };

export default function EgitimPage() {
  return <EgitimIndex lessons={LESSON_SUMMARIES} />;
}
