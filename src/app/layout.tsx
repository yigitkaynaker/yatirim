import type { Metadata, Viewport } from "next";
import "./globals.css";
import { DialogHost } from "@/components/ConfirmDialog";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

export const metadata: Metadata = {
  title: { default: "Yatırım", template: "%s · Yatırım" },
  description: "Kişisel yatırım ve portföy takibi",
  applicationName: "Yatırım",
  appleWebApp: { capable: true, title: "Yatırım", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0b1120",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body className="antialiased">
        {children}
        <DialogHost />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
