import type { FigureId } from "@/content/kilavuz";

// Kılavuzdaki basit, açıklamalı çizimler. Dış görsel yok; yalnızca SVG şekiller.
// Ekran görüntüsü değildir: uygulamadaki öğelerin sadeleştirilmiş taslağıdır.

const K = {
  bg: "#0b1120",
  surface: "#111a2e",
  surface2: "#17223a",
  line: "#233150",
  text: "#e2e8f0",
  muted: "#94a3b8",
  dim: "#64748b",
  up: "#34d399",
  down: "#fb7185",
  violet: "#a78bfa",
  note: "#facc15",
  sky: "#38bdf8",
};

/** Numaralı açıklama noktası */
function Pin({ x, y, n }: { x: number; y: number; n: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={9} fill={K.note} />
      <text x={x} y={y + 3.5} textAnchor="middle" fontSize={11} fontWeight={700} fill={K.bg}>
        {n}
      </text>
    </g>
  );
}

function Frame({ label, h, children, legend }: { label: string; h: number; children: React.ReactNode; legend?: string[] }) {
  return (
    <div>
      <svg viewBox={`0 0 360 ${h}`} className="h-auto w-full max-w-xl" role="img" aria-label={label} fontFamily="system-ui, sans-serif">
        <rect x={0.5} y={0.5} width={359} height={h - 1} rx={12} fill={K.bg} stroke={K.line} />
        {children}
      </svg>
      {legend && (
        <ol className="mt-2 grid gap-1 text-xs text-slate-400 sm:grid-cols-2">
          {legend.map((l, i) => (
            <li key={l} className="flex gap-2">
              <span className="num flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-yellow-400 text-[10px] font-bold text-slate-950">{i + 1}</span>
              {l}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Ekran() {
  return (
    <Frame label="Ekran düzeni taslağı" h={230} legend={["Logo: Portföy'e döner", "Zil: bildirimler", "Dişli: Ayarlar", "Sayfa içeriği", "Alt çubuk: ana sayfalar", "Daha fazla: diğer sayfalar"]}>
      <rect x={110} y={14} width={140} height={204} rx={16} fill={K.surface} stroke={K.line} />
      <rect x={110} y={14} width={140} height={28} rx={14} fill={K.surface2} />
      <rect x={120} y={22} width={12} height={12} rx={3} fill={K.up} />
      <text x={137} y={32} fontSize={10} fill={K.text}>
        Yatırım
      </text>
      <path d="M212 34h10M214 33c0-6 1-9 3-9s3 3 3 9" stroke={K.text} fill="none" strokeWidth={1.4} />
      <circle cx={237} cy={28} r={5} stroke={K.text} fill="none" strokeWidth={1.4} />
      <rect x={120} y={52} width={120} height={40} rx={8} fill={K.surface2} />
      <rect x={128} y={60} width={50} height={6} rx={3} fill={K.muted} />
      <rect x={128} y={72} width={80} height={10} rx={3} fill={K.text} />
      <rect x={120} y={100} width={120} height={24} rx={6} fill={K.surface2} />
      <rect x={120} y={130} width={120} height={24} rx={6} fill={K.surface2} />
      <rect x={110} y={186} width={140} height={32} fill={K.surface2} />
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x={120 + i * 26} y={194} width={14} height={14} rx={3} fill={i === 4 ? K.note : K.muted} opacity={i === 4 ? 0.8 : 0.6} />
      ))}
      <Pin x={98} y={28} n={1} />
      <Pin x={216} y={56} n={2} />
      <Pin x={262} y={28} n={3} />
      <Pin x={262} y={110} n={4} />
      <Pin x={98} y={202} n={5} />
      <Pin x={262} y={202} n={6} />
    </Frame>
  );
}

function PortfoyOzet() {
  return (
    <Frame label="Portföy özet kartı taslağı" h={190} legend={["Toplam değer (bugün)", "Toplam K/Z ve yıllık getiri", "Bugün: dünkü kapanışa göre", "Maliyet", "Gerçekleşmemiş K/Z", "Gerçekleşen K/Z"]}>
      <rect x={16} y={16} width={328} height={158} rx={12} fill={K.surface} stroke={K.line} />
      <text x={32} y={40} fontSize={11} fill={K.muted}>
        Toplam değer
      </text>
      <text x={32} y={68} fontSize={24} fontWeight={600} fill={K.text}>
        125.400 TL
      </text>
      <text x={32} y={90} fontSize={11} fill={K.up}>
        +12.400 TL (%11,0)
      </text>
      <text x={150} y={90} fontSize={11} fill={K.muted}>
        Yıllık <tspan fill={K.up}>%18</tspan>
      </text>
      <text x={222} y={90} fontSize={11} fill={K.muted}>
        Bugün <tspan fill={K.down}>−850 TL</tspan>
      </text>
      <line x1={32} x2={328} y1={104} y2={104} stroke={K.line} />
      {[
        ["Maliyet", "113.000 TL", K.text],
        ["Gerçekleşmemiş", "+12.400", K.up],
        ["Gerçekleşen", "+2.150", K.up],
      ].map(([l, v, c], i) => (
        <g key={l}>
          <text x={32 + i * 100} y={126} fontSize={10} fill={K.muted}>
            {l}
          </text>
          <text x={32 + i * 100} y={144} fontSize={12} fontWeight={600} fill={c}>
            {v}
          </text>
        </g>
      ))}
      <Pin x={200} y={60} n={1} />
      <Pin x={135} y={86} n={2} />
      <Pin x={330} y={74} n={3} />
      <Pin x={22} y={156} n={4} />
      <Pin x={122} y={156} n={5} />
      <Pin x={222} y={156} n={6} />
    </Frame>
  );
}

function PozisyonGrafik() {
  const pts = [
    [20, 120],
    [50, 110],
    [80, 128],
    [110, 135],
    [140, 118],
    [170, 100],
    [200, 108],
    [230, 86],
    [260, 74],
    [290, 82],
    [330, 64],
  ];
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ");
  return (
    <Frame label="Pozisyon grafiği taslağı" h={200} legend={["Alış işareti", "Satış işareti", "Maliyetin (ortalama maliyet)", "Hedef fiyat (not)", "Stop fiyatı (not)"]}>
      <rect x={20} y={20} width={320} height={95} fill={K.up} opacity={0.06} />
      <rect x={20} y={115} width={320} height={50} fill={K.down} opacity={0.07} />
      <line x1={20} x2={340} y1={40} y2={40} stroke={K.sky} strokeDasharray="5 4" />
      <text x={336} y={35} fontSize={9} textAnchor="end" fill={K.sky}>
        Hedef
      </text>
      <line x1={20} x2={340} y1={115} y2={115} stroke={K.note} strokeDasharray="6 4" strokeWidth={1.5} />
      <text x={336} y={111} fontSize={9} textAnchor="end" fill={K.note}>
        Maliyetin
      </text>
      <line x1={20} x2={340} y1={150} y2={150} stroke={K.down} strokeDasharray="5 4" />
      <text x={336} y={162} fontSize={9} textAnchor="end" fill={K.down}>
        Stop
      </text>
      <path d={d} fill="none" stroke={K.text} strokeWidth={2} />
      <path d="M80 146l-5 8h10z" fill={K.up} />
      <path d="M110 152l-5 8h10z" fill={K.up} />
      <path d="M260 60l-5-8h10z" fill={K.down} />
      <Pin x={95} y={176} n={1} />
      <Pin x={260} y={40} n={2} />
      <Pin x={44} y={100} n={3} />
      <Pin x={180} y={30} n={4} />
      <Pin x={180} y={176} n={5} />
    </Frame>
  );
}

function Kutu({ x, y, w, t1, t2, c = K.text }: { x: number; y: number; w: number; t1: string; t2?: string; c?: string }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={44} rx={10} fill={K.surface} stroke={K.line} />
      <text x={x + w / 2} y={y + (t2 ? 19 : 27)} textAnchor="middle" fontSize={11} fontWeight={600} fill={c}>
        {t1}
      </text>
      {t2 && (
        <text x={x + w / 2} y={y + 34} textAnchor="middle" fontSize={9} fill={K.muted}>
          {t2}
        </text>
      )}
    </g>
  );
}

const Ok = ({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) => (
  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={K.muted} strokeWidth={1.5} markerEnd="url(#ok)" />
);

function OkTanim() {
  return (
    <defs>
      <marker id="ok" viewBox="0 0 10 10" refX={8} refY={5} markerWidth={6} markerHeight={6} orient="auto-start-reverse">
        <path d="M0 0L10 5L0 10z" fill={K.muted} />
      </marker>
    </defs>
  );
}

function EmirAkisi() {
  return (
    <Frame label="Emir akışı" h={220}>
      <OkTanim />
      <Kutu x={16} y={20} w={100} t1="1. Emir ver" t2="koşul + tutar" />
      <Ok x1={116} y1={42} x2={140} y2={42} />
      <Kutu x={142} y={20} w={100} t1="2. Bekçi" t2="fiyatı kontrol eder" />
      <Ok x1={242} y1={42} x2={262} y2={42} />
      <Kutu x={264} y={20} w={80} t1="3. Koşul" t2="sağlandı mı?" c={K.note} />
      <Ok x1={304} y1={64} x2={304} y2={92} />
      <Kutu x={234} y={94} w={110} t1="4. Portföy kaydı" t2="işlem yazılır" c={K.up} />
      <Ok x1={234} y1={116} x2={186} y2={116} />
      <Kutu x={84} y={94} w={100} t1="5. Bildirim" t2="zil + telefon" c={K.sky} />
      <path d="M192 30c0-14-40-14-40 0" fill="none" stroke={K.dim} strokeDasharray="3 3" />
      <text x={172} y={14} textAnchor="middle" fontSize={8} fill={K.dim}>
        hayırsa tekrar
      </text>
      <rect x={16} y={158} width={328} height={46} rx={10} fill={K.down} opacity={0.08} stroke={K.down} strokeOpacity={0.4} />
      <text x={34} y={186} fontSize={11} fill={K.down}>
        ✕
      </text>
      <text x={52} y={178} fontSize={11} fontWeight={600} fill={K.text}>
        Aracı kuruma / bankaya hiçbir şey gitmez
      </text>
      <text x={52} y={194} fontSize={9} fill={K.muted}>
        Gerçek para hareketi olmaz; yalnızca uygulamadaki kayda işlem eklenir.
      </text>
    </Frame>
  );
}

function Makas() {
  return (
    <Frame label="Makas: alış ve satış fiyatı" h={170}>
      <text x={24} y={34} fontSize={11} fill={K.muted}>
        Gram altın (örnek)
      </text>
      <rect x={24} y={46} width={250} height={26} rx={6} fill={K.down} opacity={0.25} />
      <text x={32} y={63} fontSize={11} fill={K.text}>
        Satış: 3.050 TL
      </text>
      <text x={282} y={63} fontSize={10} fill={K.down}>
        sen öde
      </text>
      <rect x={24} y={84} width={230} height={26} rx={6} fill={K.up} opacity={0.25} />
      <text x={32} y={101} fontSize={11} fill={K.text}>
        Alış: 3.000 TL
      </text>
      <text x={262} y={101} fontSize={10} fill={K.up}>
        seni öder
      </text>
      <line x1={254} x2={274} y1={120} y2={120} stroke={K.note} strokeWidth={2} />
      <line x1={254} x2={254} y1={114} y2={126} stroke={K.note} strokeWidth={2} />
      <line x1={274} x2={274} y1={114} y2={126} stroke={K.note} strokeWidth={2} />
      <text x={24} y={146} fontSize={11} fill={K.note}>
        Makas = 50 TL/gram → 10 gramda alır almaz −500 TL görünür
      </text>
    </Frame>
  );
}

function YerelBulut() {
  return (
    <Frame label="Yerel mod ve bulut modu" h={180}>
      <text x={90} y={30} textAnchor="middle" fontSize={12} fontWeight={600} fill={K.text}>
        Yerel mod
      </text>
      <rect x={40} y={44} width={100} height={64} rx={6} fill={K.surface} stroke={K.line} />
      <rect x={70} y={108} width={40} height={8} fill={K.line} />
      <text x={90} y={72} textAnchor="middle" fontSize={10} fill={K.muted}>
        bilgisayarın
      </text>
      <text x={90} y={88} textAnchor="middle" fontSize={10} fill={K.up}>
        veri + bekçi
      </text>
      <text x={90} y={140} textAnchor="middle" fontSize={9} fill={K.muted}>
        açıkken 30 sn&apos;de bir kontrol
      </text>
      <text x={90} y={156} textAnchor="middle" fontSize={9} fill={K.muted}>
        kapalıyken kontroller durur
      </text>
      <line x1={180} x2={180} y1={20} y2={160} stroke={K.line} />
      <text x={270} y={30} textAnchor="middle" fontSize={12} fontWeight={600} fill={K.text}>
        Bulut modu
      </text>
      <path d="M232 92a18 18 0 0 1 6-35 24 24 0 0 1 45-4 18 18 0 0 1 22 39z" fill={K.surface} stroke={K.line} />
      <text x={270} y={80} textAnchor="middle" fontSize={10} fill={K.sky}>
        sunucu + veri
      </text>
      <circle cx={318} cy={112} r={10} fill="none" stroke={K.note} />
      <path d="M318 106v6l4 3" stroke={K.note} fill="none" />
      <text x={270} y={140} textAnchor="middle" fontSize={9} fill={K.muted}>
        çalar saat bekçiyi uyandırır
      </text>
      <text x={270} y={156} textAnchor="middle" fontSize={9} fill={K.muted}>
        bilgisayar kapalıyken de çalışır
      </text>
    </Frame>
  );
}

function SanalGercek() {
  return (
    <Frame label="Sanaldan gerçeğe" h={130}>
      <OkTanim />
      <rect x={20} y={30} width={130} height={60} rx={10} fill={K.violet} opacity={0.15} stroke={K.violet} strokeOpacity={0.5} />
      <text x={85} y={54} textAnchor="middle" fontSize={11} fontWeight={600} fill={K.violet}>
        Sanal pozisyon
      </text>
      <text x={85} y={72} textAnchor="middle" fontSize={9} fill={K.muted}>
        arşivlenir, silinmez
      </text>
      <Ok x1={150} y1={60} x2={206} y2={60} />
      <text x={179} y={50} textAnchor="middle" fontSize={8} fill={K.muted}>
        Gerçekten
      </text>
      <text x={179} y={76} textAnchor="middle" fontSize={8} fill={K.muted}>
        aldım
      </text>
      <rect x={210} y={30} width={130} height={60} rx={10} fill={K.up} opacity={0.12} stroke={K.up} strokeOpacity={0.5} />
      <text x={275} y={54} textAnchor="middle" fontSize={11} fontWeight={600} fill={K.up}>
        Gerçek işlem
      </text>
      <text x={275} y={72} textAnchor="middle" fontSize={9} fill={K.muted}>
        gerçek fiyat ve miktarla
      </text>
      <text x={180} y={114} textAnchor="middle" fontSize={9} fill={K.dim}>
        İkisi birbirine bağlanır: plan ile gerçekleşen karşılaştırılabilir.
      </text>
    </Frame>
  );
}

const FIGURES: Record<FigureId, () => React.ReactElement> = {
  ekran: Ekran,
  "portfoy-ozet": PortfoyOzet,
  "pozisyon-grafik": PozisyonGrafik,
  "emir-akisi": EmirAkisi,
  makas: Makas,
  "yerel-bulut": YerelBulut,
  "sanal-gercek": SanalGercek,
};

export function GuideFigure({ id }: { id: FigureId }) {
  const F = FIGURES[id];
  return <F />;
}
