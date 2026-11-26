// Videolu anlatım: dersin metninden sahne listesi üretir (React'ten bağımsız, test edilebilir).
// Her sahne bir başlık, adım adım beliren kısa maddeler (beat) ve her maddenin seslendirilecek
// cümlelerinden oluşur. Derste `video` senaryosu varsa ortadaki sahneler ondan alınır.
// Oynatıcı: src/components/egitim/VideoLesson.tsx

import { DISCLAIMER, type Lesson } from "./types";

/** Sahnede gösterilecek görsel: dersin çizimi ya da n'inci grafik örneği */
export type SceneVisual = { kind: "diagram" } | { kind: "chart"; example: number };

export interface SceneBeat {
  /** Ekranda madde olarak beliren kısa metin */
  text: string;
  /** Bu madde görünürken sırayla okunan cümleler (seslendirmeye hazır, kısa parçalar) */
  say: string[];
  /** Altyazıda gösterilecek hâli (say ile aynı sırada) */
  subtitles: string[];
}

export interface VideoScene {
  id: string;
  kind: "intro" | "content" | "end";
  heading: string;
  beats: SceneBeat[];
  visual?: SceneVisual;
  /** Maddeler numaralı liste olarak gösterilsin mi */
  numbered?: boolean;
}

/** Tek bir seslendirme parçasının en fazla uzunluğu (Chrome uzun cümleleri yarıda kesebiliyor) */
export const MAX_CHUNK = 160;

const ABBR = ["örn", "vb", "vs", "yak", "Dr", "St", "Inc", "Ltd", "No", "bkz"];

/** Metindeki markdown işaretlerini atar (ekranda gösterilecek hâl) */
export function stripMarkdown(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(^|\s)[*_]([^*_\s][^*_]*?)[*_](?=\s|[.,;:!?]|$)/g, "$1$2")
    .replace(/^#+\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Ekrandaki metni sesli okumaya uygun hâle getirir (işaretleri söze çevirir ya da atar) */
export function toSpeech(s: string): string {
  return stripMarkdown(s)
    .replace(/[*_#`~^|<>{}[\]\\]/g, " ")
    .replace(/\s*→\s*/g, ", ")
    .replace(/\s*⇒\s*/g, ", ")
    .replace(/↑/g, " yukarı")
    .replace(/↓/g, " aşağı")
    .replace(/≈\s*/g, "yaklaşık ")
    .replace(/\s*−\s*/g, " eksi ")
    .replace(/(\d)\s*–\s*(?=\d)/g, "$1 ile ")
    .replace(/–\s*(?=\d)/g, "eksi ")
    .replace(/\s+[–—]\s+/g, ", ")
    .replace(/\s*÷\s*/g, " bölü ")
    .replace(/\s*×\s*/g, " çarpı ")
    .replace(/\s*&\s*/g, " ve ")
    .replace(/\s*·\s*/g, ", ")
    .replace(/…/g, ".")
    .replace(/["“”„«»]/g, "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/,\s*,/g, ",")
    .replace(/\s+/g, " ")
    .trim();
}

/** Metni cümlelere böler; kısaltmalar ve 1.000 gibi sayılar bölünmez */
export function splitSentences(text: string): string[] {
  let t = text.replace(/\s+/g, " ").trim();
  if (!t) return [];
  ABBR.forEach((a, i) => {
    t = t.replace(new RegExp(`(^|[\\s(])${a}\\.`, "g"), `$1${a}\u0000${i}`);
  });
  const parts = t
    .split(/(?<=[.!?…]["”)]?)\s+(?=["“(]?[A-ZÇĞİÖŞÜ0-9])/u)
    .map((p) => p.replace(/\u0000\d+/g, ".").trim())
    .filter(Boolean);
  return parts;
}

/** Uzun bir cümleyi virgül / noktalı virgül yakınından MAX_CHUNK'tan kısa parçalara böler */
export function chunkSentence(s: string, max = MAX_CHUNK): string[] {
  if (s.length <= max) return [s];
  const out: string[] = [];
  let rest = s;
  while (rest.length > max) {
    const window = rest.slice(0, max);
    let cut = Math.max(window.lastIndexOf("; "), window.lastIndexOf(", "), window.lastIndexOf(": "));
    if (cut < max * 0.35) cut = window.lastIndexOf(" ");
    if (cut <= 0) cut = max - 1;
    out.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/** Bir metinden madde üretir: ekranda ilk cümle, seslendirmede metnin tamamı */
export function makeBeat(full: string, shown?: string): SceneBeat {
  const clean = stripMarkdown(full);
  const sentences = splitSentences(clean);
  // Konuşulacak bir şey içermeyen parçalar atılır; say ile subtitles aynı sırada ve uzunlukta kalır
  const subtitles = sentences.flatMap((s) => chunkSentence(s)).filter((x) => /[\p{L}\p{N}]/u.test(toSpeech(x)));
  return { text: stripMarkdown(shown ?? sentences[0] ?? clean), say: subtitles.map(toSpeech), subtitles };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Dersin tüm sahneleri: giriş, içerik sahneleri ve "mini sınavı dene" kapanışı */
export function buildScenes(lesson: Lesson): VideoScene[] {
  const scenes: VideoScene[] = [];
  scenes.push({
    id: "giris",
    kind: "intro",
    heading: lesson.title,
    beats: [makeBeat(`${lesson.title}. ${lesson.summary}`, lesson.summary)],
  });

  if (lesson.video && lesson.video.scenes.length > 0) {
    lesson.video.scenes.forEach((s, i) => {
      const visual: SceneVisual | undefined =
        s.visual === "diagram" && lesson.diagram
          ? { kind: "diagram" }
          : typeof s.visual === "number" && lesson.examples[s.visual]
            ? { kind: "chart", example: s.visual }
            : undefined;
      scenes.push({
        id: `senaryo-${i}`,
        kind: "content",
        heading: stripMarkdown(s.heading),
        beats: s.points.map((p, j) => makeBeat(s.narration?.[j] ?? p, p)),
        visual,
      });
    });
  } else {
    scenes.push({ id: "nedir", kind: "content", heading: "Nedir?", beats: lesson.what.map((p) => makeBeat(p)) });

    lesson.examples.forEach((ex, i) => {
      scenes.push({
        id: `grafik-${i}`,
        kind: "content",
        heading: lesson.examples.length > 1 ? `Grafikte: ${ex.tab}` : "Grafikte nasıl görünür?",
        beats: splitSentences(stripMarkdown(ex.caption)).map((s) => makeBeat(s)),
        visual: { kind: "chart", example: i },
      });
    });

    if (lesson.diagram) {
      scenes.push({
        id: "sekil",
        kind: "content",
        heading: lesson.diagram.title,
        beats: splitSentences(stripMarkdown(lesson.diagram.caption)).map((s) => makeBeat(s)),
        visual: { kind: "diagram" },
      });
    }

    const stepGroups = chunk(lesson.steps, 4);
    stepGroups.forEach((g, i) => {
      scenes.push({
        id: `yorum-${i}`,
        kind: "content",
        heading: stepGroups.length > 1 ? `Nasıl yorumlanır? (${i + 1}/${stepGroups.length})` : "Nasıl yorumlanır?",
        beats: g.map((s) => makeBeat(s)),
        numbered: true,
      });
    });

    if (lesson.mistakes.length > 0) {
      scenes.push({ id: "hatalar", kind: "content", heading: "Sık yapılan hatalar", beats: lesson.mistakes.map((m) => makeBeat(m)) });
    }
  }

  scenes.push({
    id: "son",
    kind: "end",
    heading: "Şimdi mini sınavı dene",
    beats: [
      makeBeat("Anlatımın sonuna geldik. Şimdi aşağıdaki mini sınavla öğrendiklerini dene.", "Öğrendiklerini 3 soruluk mini sınavla pekiştir."),
      makeBeat(`Unutma: ${DISCLAIMER}`, DISCLAIMER),
    ],
  });

  // İçerik sahnesi madde içermiyorsa (boş alanlar) listeden çıkar
  return scenes.filter((s) => s.beats.some((b) => b.say.length > 0));
}

/** Okuma hızına göre bir parçanın tahmini süresi (ms): sessiz oynatma ve güvenlik zamanlayıcısı için */
export function estimateMs(text: string, rate = 1): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1600, words * 400 + 500) / rate;
}
