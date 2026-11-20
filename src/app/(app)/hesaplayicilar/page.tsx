import type { Metadata } from "next";
import { CalculatorsView } from "@/components/CalculatorsView";

export const metadata: Metadata = { title: "Hesaplayıcılar" };

export default function CalculatorsPage() {
  return <CalculatorsView />;
}
