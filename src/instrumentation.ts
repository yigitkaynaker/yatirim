// Sunucu açılışında bir kez çalışır.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Bulut modunda (DATABASE_URL tanımlı, Vercel) süreç içi izleyici yok: sunucusuz işlev
  // istekler arasında durdurulur. Görevleri dış zamanlayıcı /api/cron/tick ile çalıştırır.
  if (process.env.DATABASE_URL) return;
  const { startOrderWatcher } = await import("./lib/orderWatcher");
  startOrderWatcher();
}
