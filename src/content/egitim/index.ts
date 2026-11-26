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
import { kriptoNedir } from "./dersler/kripto-nedir";
import { kriptoBorsaVePariteler } from "./dersler/kripto-borsa-ve-pariteler";
import { kriptoGuvenlik } from "./dersler/kripto-guvenlik";
import { bistHisseleri } from "./dersler/bist-hisseleri";
import { bistMaliyetVergiRisk } from "./dersler/bist-maliyet-vergi-risk";
import { abdHisseleri } from "./dersler/abd-hisseleri";
import { abdKurRiski } from "./dersler/abd-kur-riski";
import { abdVergiW8ben } from "./dersler/abd-vergi-w8ben";
import { etfNedir } from "./dersler/etf-nedir";
import { etfGiderOrani } from "./dersler/etf-gider-orani";
import { endeksNedir } from "./dersler/endeks-nedir";
import { endekseYatirim } from "./dersler/endekse-yatirim";
import { emtiaNedir } from "./dersler/emtia-nedir";
import { vadeliKontrat } from "./dersler/vadeli-kontrat";
import { contangoRollover } from "./dersler/contango-rollover";
import { dovizNedir } from "./dersler/doviz-nedir";
import { dovizMaliyetRisk } from "./dersler/doviz-maliyet-risk";
import { altinTurleri } from "./dersler/altin-turleri";
import { altinMakas } from "./dersler/altin-makas";
import { altinFizikiHesap } from "./dersler/altin-fiziki-hesap";
import { fonTurleri } from "./dersler/fon-turleri";
import { tefasVeValor } from "./dersler/tefas-ve-valor";
import { fonUcretStopaj } from "./dersler/fon-ucret-stopaj";
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
  // Yatırım araçları (TRACKS sırasıyla): kripto, BIST, ABD, ETF, endeks, emtia, döviz, altın, fon
  kriptoNedir,
  kriptoBorsaVePariteler,
  kriptoGuvenlik,
  bistHisseleri,
  bistMaliyetVergiRisk,
  abdHisseleri,
  abdKurRiski,
  abdVergiW8ben,
  etfNedir,
  etfGiderOrani,
  endeksNedir,
  endekseYatirim,
  emtiaNedir,
  vadeliKontrat,
  contangoRollover,
  dovizNedir,
  dovizMaliyetRisk,
  altinTurleri,
  altinMakas,
  altinFizikiHesap,
  fonTurleri,
  tefasVeValor,
  fonUcretStopaj,
];

export const LESSON_SUMMARIES: LessonSummary[] = LESSONS.map(({ slug, title, summary, level, minutes, track }) => ({ slug, title, summary, level, minutes, track }));

export function getLesson(slug: string): Lesson | undefined {
  return LESSONS.find((l) => l.slug === slug);
}

export { DISCLAIMER, TRACKS } from "./types";
