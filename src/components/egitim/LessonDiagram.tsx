"use client";

import { useState } from "react";
import type { DiagramId } from "@/content/egitim/types";

// Fiyat grafiği gerektirmeyen dersler için basit açıklayıcı çizimler (örnek rakamlarla).

const K = {
  line: "#233150",
  text: "#e2e8f0",
  muted: "#94a3b8",
  dim: "#64748b",
  up: "#34d399",
  down: "#fb7185",
  note: "#facc15",
  sky: "#38bdf8",
  violet: "#a78bfa",
};

const tl = (n: number) => `${Math.round(n).toLocaleString("tr-TR")} TL`;

/** İşlem sıklığına göre yıllık komisyon (etkileşimli) */
function Ucret() {
  const OPTIONS = [
    { turns: 4, label: "Yılda 4" },
    { turns: 12, label: "Ayda 1" },
    { turns: 52, label: "Haftada 1" },
    { turns: 250, label: "Her gün" },
  ];
  const [sel, setSel] = useState(1);
  const perTrade = 10_000 * 0.002;
  const max = 250 * 2 * perTrade;
  return (
    <div>
      <div role="radiogroup" aria-label="Al-sat sıklığı" className="mb-3 flex flex-wrap gap-1.5">
        {OPTIONS.map((o, i) => (
          <button
            key={o.label}
            type="button"
            role="radio"
            aria-checked={i === sel}
            onClick={() => setSel(i)}
            className={`rounded-lg border px-3 py-1.5 text-sm transition ${i === sel ? "border-slate-500 bg-surface-2 text-white" : "border-line text-slate-400 hover:text-white"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
      <ul className="space-y-2">
        {OPTIONS.map((o, i) => {
          const fee = o.turns * 2 * perTrade;
          return (
            <li key={o.label} className={`text-sm transition ${i === sel ? "opacity-100" : "opacity-45"}`}>
              <div className="flex justify-between gap-2 text-xs text-slate-400">
                <span>
                  {o.label} al-sat ({o.turns * 2} işlem)
                </span>
                <span className="num font-medium text-slate-200">{tl(fee)} / yıl</span>
              </div>
              <div className="mt-1 h-3 overflow-hidden rounded-full bg-bg">
                <div className="h-full rounded-full" style={{ width: `${Math.max(1.5, (fee / max) * 100)}%`, background: i === sel ? K.down : K.dim }} />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-slate-500" aria-live="polite">
        Seçili: {OPTIONS[sel].label} al-sat · 10.000 TL&apos;lik işlemler · %0,2 komisyon → yılda {tl(OPTIONS[sel].turns * 2 * perTrade)}, yani 10.000 TL&apos;nin %
        {((OPTIONS[sel].turns * 2 * perTrade) / 100).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}&apos;i.
      </p>
    </div>
  );
}

function Stopaj() {
  return (
    <svg viewBox="0 0 360 150" className="h-auto w-full max-w-xl" role="img" aria-label="Brüt 1.000 TL, stopaj 150 TL, net 850 TL" fontFamily="system-ui, sans-serif">
      <text x={10} y={30} fontSize={11} fill={K.muted}>
        Brüt
      </text>
      <rect x={60} y={16} width={280} height={22} rx={5} fill={K.sky} opacity={0.35} />
      <text x={70} y={31} fontSize={11} fill={K.text}>
        1.000 TL
      </text>
      <text x={10} y={72} fontSize={11} fill={K.muted}>
        Stopaj
      </text>
      <rect x={298} y={58} width={42} height={22} rx={5} fill={K.down} opacity={0.5} />
      <text x={292} y={73} fontSize={11} textAnchor="end" fill={K.down}>
        −150 TL (örnek %15)
      </text>
      <text x={10} y={114} fontSize={11} fill={K.muted}>
        Net
      </text>
      <rect x={60} y={100} width={238} height={22} rx={5} fill={K.up} opacity={0.4} />
      <text x={70} y={115} fontSize={11} fontWeight={600} fill={K.text}>
        850 TL hesabına geçer
      </text>
      <line x1={298} x2={298} y1={40} y2={100} stroke={K.dim} strokeDasharray="3 3" />
      <text x={10} y={142} fontSize={9} fill={K.dim}>
        Oran yalnızca örnektir; gerçek oranlar varlığa ve tarihe göre değişir.
      </text>
    </svg>
  );
}

function Cesitlendirme() {
  const one = [{ v: 100, hit: true }];
  const five = [20, 20, 20, 20, 20].map((v, i) => ({ v, hit: i === 0 }));
  const col = (x: number, title: string, parts: { v: number; hit: boolean }[], loss: string) => {
    let y = 30;
    return (
      <g>
        <text x={x + 70} y={18} textAnchor="middle" fontSize={11} fontWeight={600} fill={K.text}>
          {title}
        </text>
        {parts.map((p, i) => {
          const h = p.v * 1.1;
          const r = (
            <g key={i}>
              <rect x={x} y={y} width={140} height={h - 2} rx={5} fill={p.hit ? K.down : K.sky} opacity={p.hit ? 0.35 : 0.22} />
              {p.hit && <rect x={x} y={y} width={140 * 0.3} height={h - 2} rx={5} fill={K.down} opacity={0.7} />}
              <text x={x + 70} y={y + h / 2 + 3} textAnchor="middle" fontSize={10} fill={K.text}>
                {p.hit ? "%30 düştü" : `${(p.v * 1000).toLocaleString("tr-TR")} TL`}
              </text>
            </g>
          );
          y += h;
          return r;
        })}
        <text x={x + 70} y={160} textAnchor="middle" fontSize={11} fontWeight={600} fill={K.down}>
          {loss}
        </text>
      </g>
    );
  };
  return (
    <svg viewBox="0 0 360 172" className="h-auto w-full max-w-xl" role="img" aria-label="Tek varlıkta 30.000 TL kayıp, beş varlıkta 6.000 TL kayıp" fontFamily="system-ui, sans-serif">
      {col(16, "Tek sepet", one, "Kayıp: 30.000 TL")}
      {col(204, "Beş sepet", five, "Kayıp: 6.000 TL")}
    </svg>
  );
}

function Duygular() {
  const d = "M20 130 C60 120 80 95 110 80 S160 30 185 28 S220 50 245 80 S290 128 315 125 S340 110 345 100";
  const labels: [number, number, string, string][] = [
    [70, 118, "Umut", K.muted],
    [130, 66, "Heyecan", K.up],
    [185, 18, "Açgözlülük", K.note],
    [238, 62, "Endişe", K.muted],
    [282, 104, "Panik", K.down],
    [330, 90, "Umut", K.muted],
  ];
  return (
    <svg viewBox="0 0 360 170" className="h-auto w-full max-w-xl" role="img" aria-label="Duygu döngüsü: umut, heyecan, açgözlülük, endişe, panik" fontFamily="system-ui, sans-serif">
      <path d={d} fill="none" stroke={K.text} strokeWidth={2} />
      {labels.map(([x, y, t, c]) => (
        <text key={t + x} x={x} y={y} textAnchor="middle" fontSize={10} fill={c}>
          {t}
        </text>
      ))}
      <circle cx={185} cy={28} r={5} fill={K.note} />
      <text x={185} y={48} textAnchor="middle" fontSize={9} fill={K.note}>
        çoğu kişi burada alır
      </text>
      <circle cx={300} cy={127} r={5} fill={K.down} />
      <text x={300} y={146} textAnchor="middle" fontSize={9} fill={K.down}>
        burada satar
      </text>
      <text x={20} y={164} fontSize={9} fill={K.dim}>
        Temsilî çizim · gerçek veri değildir
      </text>
    </svg>
  );
}

/** Türkiye saatiyle BIST, ABD (yaz/kış) ve kripto işlem saatleri */
function Saatler() {
  const x = (h: number) => 74 + h * 11.5;
  const rows: { label: string; from: number; to: number; color: string; note: string }[] = [
    { label: "BIST", from: 10, to: 18, color: K.sky, note: "10:00–18:00" },
    { label: "ABD (yaz)", from: 16.5, to: 23, color: K.violet, note: "16:30–23:00" },
    { label: "ABD (kış)", from: 17.5, to: 24, color: K.violet, note: "17:30–24:00" },
    { label: "Kripto", from: 0, to: 24, color: K.note, note: "7/24" },
  ];
  return (
    <svg
      viewBox="0 0 360 172"
      className="h-auto w-full max-w-xl"
      role="img"
      aria-label="Türkiye saatiyle işlem saatleri: BIST 10:00-18:00, ABD yazın 16:30-23:00, kışın 17:30-24:00, kripto 7/24"
      fontFamily="system-ui, sans-serif"
    >
      {[0, 6, 12, 18, 24].map((h) => (
        <g key={h}>
          <line x1={x(h)} x2={x(h)} y1={14} y2={140} stroke={K.line} />
          <text x={x(h)} y={152} fontSize={9} textAnchor="middle" fill={K.dim}>
            {String(h).padStart(2, "0")}:00
          </text>
        </g>
      ))}
      {rows.map((r, i) => {
        const y = 20 + i * 30;
        return (
          <g key={r.label}>
            <text x={4} y={y + 13} fontSize={10} fill={K.muted}>
              {r.label}
            </text>
            <rect x={x(r.from)} y={y} width={x(r.to) - x(r.from)} height={18} rx={4} fill={r.color} opacity={0.45} />
            <text x={(x(r.from) + x(r.to)) / 2} y={y + 13} fontSize={9.5} textAnchor="middle" fill={K.text}>
              {r.note}
            </text>
          </g>
        );
      })}
      <text x={4} y={168} fontSize={9} fill={K.dim}>
        Türkiye saati · normal seanslar · tatil ve yarım günler hariç
      </text>
    </svg>
  );
}

const pctTr = (n: number) => `%${n.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}`;

function Choices({ label, options, sel, onSelect }: { label: string; options: string[]; sel: number; onSelect: (i: number) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="mb-3 flex flex-wrap gap-1.5">
      {options.map((o, i) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={i === sel}
          onClick={() => onSelect(i)}
          className={`rounded-lg border px-3 py-1.5 text-sm transition ${i === sel ? "border-slate-500 bg-surface-2 text-white" : "border-line text-slate-400 hover:text-white"}`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

/** Hisse dolar bazında %10 kazandırırken kur değişiminin TL getirisine etkisi (etkileşimli) */
function Kur() {
  const OPTIONS = [-10, 0, 10, 20, 40];
  const [sel, setSel] = useState(2);
  const stock = 10;
  const fx = OPTIONS[sel];
  const tlRet = ((1 + stock / 100) * (1 + fx / 100) - 1) * 100;
  const bars = [
    { label: "Hisse (dolar bazında)", v: stock, color: K.sky },
    { label: "Kur (dolar/TL)", v: fx, color: K.violet },
    { label: "Toplam (TL bazında)", v: tlRet, color: K.up },
  ];
  const max = 60;
  return (
    <div>
      <Choices label="Kur değişimi" options={OPTIONS.map((o) => `Kur ${o > 0 ? "+" : ""}${pctTr(o)}`)} sel={sel} onSelect={setSel} />
      <ul className="space-y-2">
        {bars.map((b) => (
          <li key={b.label} className="text-sm">
            <div className="flex justify-between gap-2 text-xs text-slate-400">
              <span>{b.label}</span>
              <span className="num font-medium text-slate-200">{pctTr(b.v)}</span>
            </div>
            <div className="mt-1 h-3 overflow-hidden rounded-full bg-bg">
              <div className="h-full rounded-full" style={{ width: `${Math.max(1.5, (Math.abs(b.v) / max) * 100)}%`, background: b.v < 0 ? K.down : b.color }} />
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-slate-500" aria-live="polite">
        10.000 TL&apos;lik yatırım: hisse %10, kur {pctTr(fx)} → yaklaşık {tl(10_000 * (1 + tlRet / 100))} (TL getirisi {pctTr(tlRet)}).
      </p>
    </div>
  );
}

/** Gider oranına göre 20 yıl sonraki birikim (etkileşimli) */
function Gider() {
  const OPTIONS = [0.1, 0.5, 1, 2];
  const [sel, setSel] = useState(2);
  const value = (er: number) => 100_000 * Math.pow(1 + 0.08 - er / 100, 20);
  const max = value(0);
  return (
    <div>
      <Choices label="Yıllık gider oranı" options={OPTIONS.map(pctTr)} sel={sel} onSelect={setSel} />
      <ul className="space-y-2">
        {OPTIONS.map((o, i) => (
          <li key={o} className={`text-sm transition ${i === sel ? "opacity-100" : "opacity-45"}`}>
            <div className="flex justify-between gap-2 text-xs text-slate-400">
              <span>Gider oranı {pctTr(o)}</span>
              <span className="num font-medium text-slate-200">{tl(value(o))}</span>
            </div>
            <div className="mt-1 h-3 overflow-hidden rounded-full bg-bg">
              <div className="h-full rounded-full" style={{ width: `${(value(o) / max) * 100}%`, background: i === sel ? K.sky : K.dim }} />
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-slate-500" aria-live="polite">
        {pctTr(OPTIONS[sel])} gider oranıyla 20 yıl sonunda {tl(value(OPTIONS[sel]))}; %0,1&apos;lik ürüne göre fark {tl(value(0.1) - value(OPTIONS[sel]))}.
      </p>
    </div>
  );
}

/** Contango'da her vade yenilemesinde fonun spot fiyatın gerisinde kalması */
function Contango() {
  const months = [0, 1, 2, 3, 4, 5, 6];
  const x = (m: number) => 40 + m * 48;
  const y = (v: number) => 30 + (100 - v) * 5;
  // Her ay 70 $'dan satıp 72 $'dan almak ≈ %2,8 geride kalmak
  const fund = months.map((m) => 100 * Math.pow(70 / 72, m));
  const path = fund.map((v, i) => (i === 0 ? `M${x(0)} ${y(v)}` : `H${x(i)} V${y(v)}`)).join(" ");
  return (
    <svg viewBox="0 0 360 172" className="h-auto w-full max-w-xl" role="img" aria-label="Spot fiyat yatay kalırken fon değeri her vade yenilemesinde düşüyor" fontFamily="system-ui, sans-serif">
      <line x1={x(0)} x2={x(6)} y1={y(100)} y2={y(100)} stroke={K.note} strokeWidth={2} />
      <text x={x(6)} y={y(100) - 8} fontSize={10} textAnchor="end" fill={K.note}>
        Spot fiyat: yatay (100)
      </text>
      <path d={path} fill="none" stroke={K.down} strokeWidth={2} />
      {fund.slice(1).map((v, i) => (
        <circle key={i} cx={x(i + 1)} cy={y(v)} r={3} fill={K.down} />
      ))}
      <text x={x(6)} y={y(fund[6]) + 16} fontSize={10} textAnchor="end" fill={K.down}>
        Fon değeri: {Math.round(fund[6])}
      </text>
      <text x={x(1) + 4} y={y(fund[1]) + 14} fontSize={9} fill={K.muted}>
        her ay: sat 70 $ → al 72 $
      </text>
      {months.map((m) => (
        <text key={m} x={x(m)} y={152} fontSize={9} textAnchor="middle" fill={K.dim}>
          {m === 0 ? "Başta" : `${m}. ay`}
        </text>
      ))}
      <text x={4} y={168} fontSize={9} fill={K.dim}>
        Temsilî çizim · her ay aynı fark varsayıldı
      </text>
    </svg>
  );
}

/** Altında satış ve alış fiyatı arasındaki makas */
function AltinMakas() {
  return (
    <svg viewBox="0 0 360 160" className="h-auto w-full max-w-xl" role="img" aria-label="Satış 3.050 TL, alış 3.000 TL, makas 50 TL" fontFamily="system-ui, sans-serif">
      <rect x={20} y={20} width={140} height={26} rx={5} fill={K.down} opacity={0.35} />
      <text x={30} y={37} fontSize={11} fill={K.text}>
        Satış 3.050 TL
      </text>
      <text x={168} y={37} fontSize={10} fill={K.muted}>
        ← sen bu fiyattan alırsın
      </text>
      <rect x={20} y={86} width={140} height={26} rx={5} fill={K.up} opacity={0.35} />
      <text x={30} y={103} fontSize={11} fill={K.text}>
        Alış 3.000 TL
      </text>
      <text x={168} y={103} fontSize={10} fill={K.muted}>
        ← sen bu fiyattan satarsın
      </text>
      <line x1={90} x2={90} y1={48} y2={84} stroke={K.note} strokeDasharray="3 3" />
      <text x={98} y={70} fontSize={10.5} fontWeight={600} fill={K.note}>
        Makas: 50 TL (≈ %1,7)
      </text>
      <text x={20} y={136} fontSize={10} fill={K.muted}>
        Aldığın anda değerin alış fiyatıyla hesaplanır: 3.000 TL.
      </text>
      <text x={20} y={152} fontSize={9} fill={K.dim}>
        Rakamlar örnektir.
      </text>
    </svg>
  );
}

export function LessonDiagram({ id }: { id: DiagramId }) {
  switch (id) {
    case "ucret":
      return <Ucret />;
    case "stopaj":
      return <Stopaj />;
    case "cesitlendirme":
      return <Cesitlendirme />;
    case "duygular":
      return <Duygular />;
    case "saatler":
      return <Saatler />;
    case "kur":
      return <Kur />;
    case "gider":
      return <Gider />;
    case "contango":
      return <Contango />;
    case "altinMakas":
      return <AltinMakas />;
  }
}
