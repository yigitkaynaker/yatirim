import type { Metadata } from "next";
import { Suspense } from "react";
import { AssetDetailView } from "@/components/AssetDetailView";

export const metadata: Metadata = { title: "Varlık detayı" };

export default function AssetDetailPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Yükleniyor…</p>}>
      <AssetDetailView />
    </Suspense>
  );
}
