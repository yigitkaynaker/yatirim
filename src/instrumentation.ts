// Sunucu açılışında bir kez çalışır.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startOrderWatcher } = await import("./lib/orderWatcher");
  startOrderWatcher();
}
