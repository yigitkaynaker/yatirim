import type { Metadata } from "next";
import { DividendsView } from "@/components/DividendsView";

export const metadata: Metadata = { title: "Temettü" };

export default function DividendsPage() {
  return <DividendsView />;
}
