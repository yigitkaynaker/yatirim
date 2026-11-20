import type { Metadata } from "next";
import { Suspense } from "react";
import { KapView } from "@/components/KapView";

export const metadata: Metadata = { title: "KAP bildirimleri" };

export default function KapPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Yükleniyor…</p>}>
      <KapView />
    </Suspense>
  );
}
