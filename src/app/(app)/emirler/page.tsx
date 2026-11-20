import type { Metadata } from "next";
import { OrdersView } from "@/components/OrdersView";

export const metadata: Metadata = { title: "Emirler" };

export default function OrdersPage() {
  return <OrdersView />;
}
