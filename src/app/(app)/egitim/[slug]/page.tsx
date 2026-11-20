import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LessonView } from "@/components/egitim/LessonView";
import { getLesson, LESSON_SUMMARIES, LESSONS } from "@/content/egitim";

export const dynamicParams = false;

export function generateStaticParams() {
  return LESSONS.map((l) => ({ slug: l.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const lesson = getLesson(slug);
  return { title: lesson ? `${lesson.title} · Eğitim` : "Eğitim" };
}

export default async function LessonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const lesson = getLesson(slug);
  if (!lesson) notFound();
  const idx = LESSONS.indexOf(lesson);
  return (
    <LessonView
      lesson={lesson}
      order={idx + 1}
      total={LESSONS.length}
      prev={LESSON_SUMMARIES[idx - 1] ?? null}
      next={LESSON_SUMMARIES[idx + 1] ?? null}
    />
  );
}
