import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Test derlemeleri çalışan sunucunun .next klasörüne dokunmasın diye ayrı klasör: NEXT_DIST_DIR=.next-test
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // yahoo-finance2 sunucu tarafında olduğu gibi çalışsın (paketlenmesin).
  serverExternalPackages: ["yahoo-finance2"],
  // Telefon Tailscale üzerinden IP / MagicDNS adıyla bağlanır; dev modda HMR'a izin ver.
  allowedDevOrigins: ["*.ts.net", "100.*.*.*", "192.168.*.*"],
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
