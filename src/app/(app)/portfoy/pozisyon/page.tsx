import type { Metadata } from "next";
import { Suspense } from "react";
import { PositionDetailView } from "@/components/PositionDetailView";

export const metadata: Metadata = { title: "Pozisyon" };

export default function PositionPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Yükleniyor…</p>}>
      <PositionDetailView />
    </Suspense>
  );
}
