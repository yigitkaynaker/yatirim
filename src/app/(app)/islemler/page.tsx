import type { Metadata } from "next";
import { TransactionsView } from "@/components/TransactionsView";

export const metadata: Metadata = { title: "İşlemler" };

export default function TransactionsPage() {
  return <TransactionsView />;
}
