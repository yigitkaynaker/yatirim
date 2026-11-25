import type { Metadata } from "next";
import { KilavuzView } from "@/components/kilavuz/KilavuzView";

export const metadata: Metadata = { title: "Kullanım kılavuzu" };

export default function KilavuzPage() {
  return <KilavuzView />;
}
