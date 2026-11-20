import type { Metadata } from "next";
import { SignalsView } from "@/components/SignalsView";

export const metadata: Metadata = { title: "Sinyaller" };

export default function SignalsPage() {
  return <SignalsView />;
}
