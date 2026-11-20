import type { Metadata } from "next";
import { Suspense } from "react";
import { AlarmsView } from "@/components/AlarmsView";

export const metadata: Metadata = { title: "Alarmlar" };

export default function AlarmsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Yükleniyor…</p>}>
      <AlarmsView />
    </Suspense>
  );
}
