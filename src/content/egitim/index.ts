// Derslerin önerilen öğrenme sırası. İlk ders "İlk adımlar" kartında kullanılır
// (FIRST_LESSON_SLUG, src/components/FirstSteps.tsx); değiştirirsen orayı da güncelle. Yeni ders eklemek için dersler/ altına dosya
// ekleyip buradaki listeye uygun yere yazmak yeterlidir.

import { bollingerDersi } from "./dersler/bollinger";
import { destekDirenc } from "./dersler/destek-direnc";
import { fibonacci } from "./dersler/fibonacci";
import { grafikFormasyonlari } from "./dersler/grafik-formasyonlari";
import { hacim } from "./dersler/hacim";
import { hareketliOrtalamalar } from "./dersler/hareketli-ortalamalar";
import { macdDersi } from "./dersler/macd";
import { mumFormasyonlari } from "./dersler/mum-formasyonlari";
import { mumGrafigi } from "./dersler/mum-grafigi";
import { riskYonetimi } from "./dersler/risk-yonetimi";
import { rsiDersi } from "./dersler/rsi";
import { trend } from "./dersler/trend";
import { ucretlerVeKomisyon } from "./dersler/ucretler-ve-komisyon";
import { vergiTemelleriStopaj } from "./dersler/vergi-temelleri-stopaj";
import { cesitlendirme } from "./dersler/cesitlendirme";
import { duygularVeAsiriIslem } from "./dersler/duygular-ve-asiri-islem";
import type { Lesson, LessonSummary } from "./types";

export const LESSONS: Lesson[] = [
  mumGrafigi,
  trend,
  destekDirenc,
  hareketliOrtalamalar,
  rsiDersi,
  macdDersi,
  bollingerDersi,
  hacim,
  mumFormasyonlari,
  grafikFormasyonlari,
  fibonacci,
  riskYonetimi,
  // Yatırımın temelleri (fiyat grafiği gerektirmeyen dersler)
  ucretlerVeKomisyon,
  vergiTemelleriStopaj,
  cesitlendirme,
  duygularVeAsiriIslem,
];

export const LESSON_SUMMARIES: LessonSummary[] = LESSONS.map(({ slug, title, summary, level, minutes, track }) => ({ slug, title, summary, level, minutes, track }));

export function getLesson(slug: string): Lesson | undefined {
  return LESSONS.find((l) => l.slug === slug);
}

export { DISCLAIMER } from "./types";
