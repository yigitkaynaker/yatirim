// Geliştirme / test için gömülü Postgres (PGlite) sunucusu — Docker ya da kurulum gerekmez.
//   node scripts/pg-dev-server.mjs [--port 5433] [--dir <klasör>]   (klasör yoksa bellekte)
// Bağlantı: postgresql://postgres:postgres@127.0.0.1:<port>/postgres?sslmode=disable
// Not: PGlite tek oturumludur; sunucu bağlantıları çoğullar (işlem süresince tek bağlantı çalışır).
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

export async function startPgDevServer({ port = 0, dir } = {}) {
  const db = await PGlite.create(dir ? { dataDir: dir } : undefined);
  const server = new PGLiteSocketServer({ db, port, host: "127.0.0.1", maxConnections: 20 });
  await server.start();
  const addr = server.getServerConn();
  const p = Number(String(addr).split(":").pop());
  const url = `postgresql://postgres:postgres@127.0.0.1:${p}/postgres?sslmode=disable`;
  return {
    url,
    port: p,
    async stop() {
      await server.stop();
      await db.close();
    },
  };
}

if (process.argv[1] && /pg-dev-server.mjs$/.test(process.argv[1])) {
  const arg = (n) => {
    const i = process.argv.indexOf(n);
    return i > 0 ? process.argv[i + 1] : undefined;
  };
  const s = await startPgDevServer({ port: Number(arg("--port") ?? 5433), dir: arg("--dir") });
  console.log(`PGlite hazır: ${s.url}`);
  const stop = async () => {
    await s.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
