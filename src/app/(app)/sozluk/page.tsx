import type { Metadata } from "next";
import { SozlukView } from "@/components/kilavuz/SozlukView";

export const metadata: Metadata = { title: "Sözlük" };

export default function SozlukPage() {
  return <SozlukView />;
}
