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
  }
}
