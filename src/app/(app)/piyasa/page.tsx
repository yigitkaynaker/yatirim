import type { Metadata } from "next";
import { MarketView } from "@/components/MarketView";

export const metadata: Metadata = { title: "Piyasa" };

export default function MarketPage() {
  return <MarketView />;
}
