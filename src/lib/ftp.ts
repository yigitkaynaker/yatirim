import "server-only";
import net from "node:net";

// Anonim FTP'den tek dosya indirme (pasif kip, yalnızca okuma). Nasdaq Trader sembol dizini için:
// HTTPS ucu Imperva bot korumasının arkasında ve Node'dan gelen istekleri çoğu zaman 200 + HTML
// sorgu sayfasıyla yanıtlıyor; aynı dosyalar ftp.nasdaqtrader.com'da korumasız yayımlanıyor.

interface Reply {
  code: number;
  text: string;
}

/** `host` üzerindeki `file` dosyasını metin olarak indirir; süre aşılırsa ya da sunucu reddederse hata verir. */
export async function ftpGetText(host: string, file: string, timeoutMs = 40_000): Promise<string> {
  const sockets: net.Socket[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`FTP zaman aşımı (${host})`)), timeoutMs);
  });
  const job = download(host, file, sockets);
  job.catch(() => {}); // zaman aşımından sonra gelen hata yutulur
  try {
    return await Promise.race([job, timeout]);
  } finally {
    clearTimeout(timer);
    for (const s of sockets) s.destroy();
  }
}

async function download(host: string, file: string, sockets: net.Socket[]): Promise<string> {
  const ctrl = net.connect(21, host);
  sockets.push(ctrl);
  ctrl.setEncoding("utf8");

  // Yanıt okuyucu: çok satırlı yanıtlar ("220-…" … "220 …") tek yanıt olarak birleştirilir
  const replies: Reply[] = [];
  let failure: Error | null = null;
  let wake: (() => void) | null = null;
  let buf = "";
  let lines: string[] = [];
  ctrl.on("data", (chunk: string) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).replace(/\r$/, "");
      buf = buf.slice(i + 1);
      lines.push(line);
      const code = lines[0].slice(0, 3);
      if (!/^\d{3}$/.test(code)) {
        lines = [];
        continue;
      }
      if (lines[0][3] !== "-" || (lines.length > 1 && line.startsWith(`${code} `))) {
        replies.push({ code: Number(code), text: lines.join("\n") });
        lines = [];
      }
    }
    wake?.();
  });
  const fail = (err: Error) => {
    failure ??= err;
    wake?.();
  };
  ctrl.on("error", fail);
  ctrl.on("close", () => fail(new Error("FTP bağlantısı kapandı")));

  const next = async (): Promise<Reply> => {
    while (replies.length === 0) {
      if (failure) throw failure;
      await new Promise<void>((r) => (wake = r));
      wake = null;
    }
    return replies.shift()!;
  };
  const expect = async (ok: number[]): Promise<Reply> => {
    const r = await next();
    if (!ok.includes(r.code)) throw new Error(`FTP: ${r.text.split("\n")[0]}`);
    return r;
  };
  const send = async (cmd: string, ok: number[]) => {
    ctrl.write(`${cmd}\r\n`);
    return await expect(ok);
  };

  await expect([220]);
  const user = await send("USER anonymous", [230, 331]);
  if (user.code === 331) await send("PASS anonymous@", [230]);
  await send("TYPE I", [200]);
  const pasv = await send("PASV", [227]);
  const m = /(\d+),(\d+),(\d+),(\d+),(\d+),(\d+)/.exec(pasv.text);
  if (!m) throw new Error("FTP: pasif kip adresi okunamadı");
  // Sunucunun bildirdiği IP yerine denetim bağlantısının adresi (NAT arkasındaki sunucular için)
  const data = net.connect(Number(m[5]) * 256 + Number(m[6]), host);
  sockets.push(data);
  const chunks: Buffer[] = [];
  const received = new Promise<void>((resolve, reject) => {
    data.on("data", (c: Buffer) => chunks.push(c));
    data.on("end", resolve);
    data.on("error", reject);
  });
  received.catch(() => {}); // RETR yanıtı beklenirken gelen hata aşağıda yeniden fırlatılır
  await send(`RETR ${file}`, [125, 150]);
  await received;
  await expect([226, 250]);
  ctrl.write("QUIT\r\n");
  return Buffer.concat(chunks).toString("utf8");
}
