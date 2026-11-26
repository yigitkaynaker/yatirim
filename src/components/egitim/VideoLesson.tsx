"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { DISCLAIMER, TRACKS, type Lesson } from "@/content/egitim/types";
import { buildScenes, estimateMs, type VideoScene } from "@/content/egitim/video";
import { LessonChart } from "./LessonChart";
import { LessonDiagram } from "./LessonDiagram";

// Videolu anlatım: dersin içeriğinden üretilen sahneleri (video.ts) maddeler adım adım belirerek,
// tarayıcının sesli okumasıyla (Web Speech API, Türkçe ses) ve altyazıyla oynatır. Video dosyası yoktur.
// Türkçe ses yoksa ya da tarayıcı desteklemiyorsa sessiz oynar: altyazı + tahmini sürelerle ilerler.

const SPEEDS = [0.75, 1, 1.25, 1.5] as const;
const PREF_KEY = "yatirim-video-anlatim";
/** Sahne geçişlerindeki kısa sessizlik (ms) */
const SCENE_GAP = 650;

interface Prefs {
  speed: number;
  muted: boolean;
  subs: boolean;
}

function loadPrefs(): Prefs {
  try {
    const p = JSON.parse(localStorage.getItem(PREF_KEY) ?? "{}") as Partial<Prefs>;
    return {
      speed: SPEEDS.includes(p.speed as (typeof SPEEDS)[number]) ? (p.speed as number) : 1,
      muted: p.muted === true,
      subs: p.subs !== false,
    };
  } catch {
    return { speed: 1, muted: false, subs: true };
  }
}

function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(p));
  } catch {
    // gizli sekme vb.: tercih yalnızca bu oturumda kalır
  }
}

const hasSpeech = () => typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

function turkishVoice(): SpeechSynthesisVoice | null | undefined {
  const all = window.speechSynthesis.getVoices();
  if (all.length === 0) return undefined; // liste henüz yüklenmedi / tarayıcı listelemiyor
  const tr = all.filter((v) => v.lang.toLowerCase().replace("_", "-").startsWith("tr"));
  return tr.find((v) => v.default) ?? tr.find((v) => v.localService) ?? tr[0] ?? null;
}

/**
 * Ses açılışını bir kullanıcı dokunuşu içinde "kilitten çıkarır" (iOS Safari konuşmayı yalnızca
 * dokunuşla başlatır). Oynatıcıyı açan düğmenin onClick'inde çağrılır.
 */
export function unlockSpeech() {
  if (!hasSpeech()) return;
  try {
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    u.lang = "tr-TR";
    window.speechSynthesis.speak(u);
  } catch {
    // sessiz oynatma yine çalışır
  }
}

const REDUCED_MQ = "(prefers-reduced-motion: reduce)";

function usePrefersReducedMotion() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(REDUCED_MQ);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(REDUCED_MQ).matches,
    () => false,
  );
}

function fullscreenSupported() {
  const el = document.documentElement as FsElement;
  return !!(el.requestFullscreen || el.webkitRequestFullscreen) && (document.fullscreenEnabled ?? true);
}

/**
 * Çizimi sahne başında parça parça "çizerek" getirir (yukarıdan aşağıya sırayla belirir);
 * anlatım yeni bir maddeye geçtikçe çerçeve kısa bir vurguyla parlar.
 */
function DiagramReveal({ lesson, beat, reduced }: { lesson: Lesson; beat: number; reduced: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root || reduced) return;
    const svg = root.querySelector("svg");
    const parts = Array.from((svg ?? root.firstElementChild)?.children ?? []) as Element[];
    const step = Math.min(140, 2200 / Math.max(1, parts.length));
    parts.forEach((el, i) => {
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 450, delay: 200 + i * step, easing: "ease-out", fill: "backwards" });
    });
  }, [reduced]);
  useEffect(() => {
    if (!ref.current || reduced || beat === 0) return;
    ref.current.animate([{ boxShadow: "0 0 0 0 rgba(52,211,153,0)" }, { boxShadow: "0 0 0 3px rgba(52,211,153,0.45)" }, { boxShadow: "0 0 0 0 rgba(52,211,153,0)" }], {
      duration: 900,
      easing: "ease-out",
    });
  }, [beat, reduced]);
  if (!lesson.diagram) return null;
  return (
    <div ref={ref} className="rounded-xl border border-line bg-surface/60 p-3">
      <LessonDiagram id={lesson.diagram.id} />
    </div>
  );
}

function Icon({ d, className = "h-5 w-5" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

const I = {
  play: "M7 4.5v15l12-7.5z",
  pause: "M8 5v14M16 5v14",
  prev: "M18 6l-8 6 8 6zM6 6v12",
  next: "M6 6l8 6-8 6zM18 6v12",
  close: "M6 6l12 12M18 6L6 18",
  vol: "M4 9v6h4l5 4V5L8 9zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12",
  mute: "M4 9v6h4l5 4V5L8 9zM17 9l5 6M22 9l-5 6",
  fs: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  fsExit: "M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5",
  replay: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5",
};

type FsElement = HTMLElement & { webkitRequestFullscreen?: () => void };
type FsDocument = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };

export function VideoLesson({ lesson, onClose }: { lesson: Lesson; onClose: () => void }) {
  const scenes = useMemo(() => buildScenes(lesson), [lesson]);
  /** Her sahnenin sırayla okunan parçaları: hangi maddeye ait olduğu ve metni */
  const flat = useMemo(() => scenes.map((s) => s.beats.flatMap((b, beat) => b.say.map((say, k) => ({ beat, say, sub: b.subtitles[k] })))), [scenes]);
  const reduced = usePrefersReducedMotion();

  const [view, setView] = useState({ scene: 0, step: 0 });
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  // Oynatıcı yalnızca tarayıcıda, bir tıklamayla açılır: localStorage doğrudan okunabilir
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [note, setNote] = useState<string | null>(null);
  const [isFs, setIsFs] = useState(false);
  const [canFs] = useState(fullscreenSupported);

  const pos = useRef({ scene: 0, step: 0 });
  const gen = useRef(0);
  const timers = useRef<number[]>([]);
  const prefsRef = useRef(prefs);
  const voice = useRef<SpeechSynthesisVoice | null | undefined>(undefined);
  const silent = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const playBtn = useRef<HTMLButtonElement>(null);

  const stopAll = useCallback(() => {
    gen.current++;
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    if (hasSpeech()) window.speechSynthesis.cancel();
  }, []);

  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  // run ve advance birbirini çağırır; en güncel hâllerine ref üzerinden ulaşılır
  const runRef = useRef<() => void>(() => {});
  const advanceRef = useRef<() => void>(() => {});

  const finish = useCallback(() => {
    stopAll();
    setPlaying(false);
    setEnded(true);
  }, [stopAll]);

  useLayoutEffect(() => {
    advanceRef.current = () => {
      const { scene, step } = pos.current;
      if (step + 1 < flat[scene].length) {
        pos.current = { scene, step: step + 1 };
        setView(pos.current);
        runRef.current();
      } else if (scene + 1 < scenes.length) {
        stopAll();
        const g = gen.current;
        later(() => {
          if (g !== gen.current) return;
          pos.current = { scene: scene + 1, step: 0 };
          setView(pos.current);
          runRef.current();
        }, SCENE_GAP / prefsRef.current.speed);
      } else {
        finish();
      }
    };

    runRef.current = () => {
      const g = ++gen.current;
      const item = flat[pos.current.scene]?.[pos.current.step];
      if (!item) return;
      const rate = prefsRef.current.speed;
      const done = () => {
        if (g === gen.current) advanceRef.current();
      };
      const useVoice = hasSpeech() && !silent.current && !prefsRef.current.muted;
      if (!useVoice) {
        later(done, estimateMs(item.say, rate));
        return;
      }
      const synth = window.speechSynthesis;
      if (synth.speaking || synth.pending) synth.cancel();
      const u = new SpeechSynthesisUtterance(item.say);
      u.lang = "tr-TR";
      if (voice.current) u.voice = voice.current;
      u.rate = rate;
      let started = false;
      u.onstart = () => {
        started = true;
      };
      u.onend = done;
      u.onerror = (e) => {
        if (g !== gen.current) return;
        if (e.error === "interrupted" || e.error === "canceled") return;
        if (e.error === "not-allowed") {
          // Tarayıcı dokunuş olmadan konuşmaya izin vermedi: oynat düğmesini bekle
          stopAll();
          setPlaying(false);
          return;
        }
        done();
      };
      synth.speak(u);
      // Ses hiç başlamazsa (ses motoru yok / bozuk) sessiz oynatmaya geçilir
      later(() => {
        if (g !== gen.current || started || synth.speaking) return;
        synth.cancel();
        silent.current = true;
        setNote("Sesli okuma başlatılamadı; anlatım altyazıyla, sessiz oynatılıyor.");
        runRef.current();
      }, 3000);
      // Güvenlik ağı: bazı tarayıcılarda onend hiç gelmeyebilir
      later(
        () => {
          if (g !== gen.current) return;
          synth.cancel();
          advanceRef.current();
        },
        estimateMs(item.say, rate) * 2.5 + 4000,
      );
    };
  });

  /** Ses durumunu belirler: Türkçe ses yoksa ya da destek yoksa sessiz oynatma notu gösterilir */
  const resolveVoice = useCallback(() => {
    if (!hasSpeech()) {
      silent.current = true;
      setNote("Tarayıcın sesli okumayı desteklemiyor; anlatım altyazıyla, sessiz oynatılıyor.");
      return;
    }
    const v = turkishVoice();
    voice.current = v;
    if (v === null) {
      silent.current = true;
      setNote("Bu cihazda Türkçe ses bulunamadı; anlatım altyazıyla, sessiz oynatılıyor.");
    } else {
      silent.current = false;
      setNote(null);
    }
  }, []);

  const play = useCallback(() => {
    resolveVoice();
    if (ended) {
      pos.current = { scene: 0, step: 0 };
      setView(pos.current);
      setEnded(false);
    }
    stopAll();
    setPlaying(true);
    // Doğrudan tıklama içinde konuşmaya başlanır (iOS Safari bunu şart koşar)
    runRef.current();
  }, [ended, resolveVoice, stopAll]);

  const pause = useCallback(() => {
    stopAll();
    setPlaying(false);
  }, [stopAll]);

  const toggle = useCallback(() => (playing ? pause() : play()), [playing, pause, play]);

  const goScene = useCallback(
    (scene: number) => {
      const s = Math.max(0, Math.min(scenes.length - 1, scene));
      stopAll();
      setEnded(false);
      pos.current = { scene: s, step: 0 };
      setView(pos.current);
      if (playing) runRef.current();
    },
    [playing, scenes.length, stopAll],
  );

  const updatePrefs = useCallback(
    (patch: Partial<Prefs>) => {
      const next = { ...prefsRef.current, ...patch };
      prefsRef.current = next;
      setPrefs(next);
      savePrefs(next);
      // Hız ya da ses değiştiyse o anki cümle yeni ayarla baştan okunur
      if (playing && ("speed" in patch || "muted" in patch)) {
        stopAll();
        runRef.current();
      }
    },
    [playing, stopAll],
  );

  const close = useCallback(() => {
    stopAll();
    const d = document as FsDocument;
    if (d.fullscreenElement) void d.exitFullscreen().catch(() => {});
    else if (d.webkitFullscreenElement) d.webkitExitFullscreen?.();
    onClose();
  }, [onClose, stopAll]);

  const toggleFs = useCallback(() => {
    const d = document as FsDocument;
    const el = panelRef.current as FsElement | null;
    if (!el) return;
    if (d.fullscreenElement || d.webkitFullscreenElement) {
      if (d.exitFullscreen) void d.exitFullscreen().catch(() => {});
      else d.webkitExitFullscreen?.();
    } else if (el.requestFullscreen) {
      void el.requestFullscreen().catch(() => {});
    } else {
      el.webkitRequestFullscreen?.();
    }
  }, []);

  // Açılış: sesleri dinle, kaydırmayı kilitle, tam ekran değişimini izle
  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onFs = () => {
      const d = document as FsDocument;
      setIsFs(!!(d.fullscreenElement || d.webkitFullscreenElement));
    };
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("webkitfullscreenchange", onFs);
    const onVoices = () => {
      if (hasSpeech() && turkishVoice() !== undefined) resolveVoice();
    };
    if (hasSpeech()) window.speechSynthesis.addEventListener?.("voiceschanged", onVoices);
    // Sayfa gizlenince ya da kapanınca konuşma durur
    const onHide = () => {
      stopAll();
      setPlaying(false);
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") onHide();
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVis);
    // Chrome uzun konuşmaları ~15 sn sonra kesebiliyor: konuşurken arada duraklat/sürdür
    const isAndroid = /android/i.test(navigator.userAgent);
    const keepAlive = window.setInterval(() => {
      if (!isAndroid && hasSpeech() && window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      }
    }, 9000);
    playBtn.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("webkitfullscreenchange", onFs);
      if (hasSpeech()) window.speechSynthesis.removeEventListener?.("voiceschanged", onVoices);
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(keepAlive);
      stopAll();
      prevFocus?.focus?.();
    };
  }, [resolveVoice, stopAll]);

  // Açan düğme sesi kilitten çıkardığı için doğrudan başlanır; tarayıcı izin vermezse oynat düğmesi bekler
  const playRef = useRef(play);
  useLayoutEffect(() => {
    playRef.current = play;
  });
  useEffect(() => {
    playRef.current();
  }, []);

  // Sahne değişince sahneyi yumuşakça getir
  const stageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (reduced || !stageRef.current) return;
    stageRef.current.animate(
      [
        { opacity: 0, transform: "scale(0.985) translateY(6px)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: 380, easing: "ease-out" },
    );
    stageRef.current.scrollTop = 0;
  }, [view.scene, reduced]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === " " || e.key === "k") {
      e.preventDefault();
      toggle();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      goScene(view.scene + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      goScene(view.scene - 1);
    } else if (e.key === "Tab" && panelRef.current) {
      // Odak oynatıcının içinde kalsın
      const f = Array.from(panelRef.current.querySelectorAll<HTMLElement>("button, a[href]")).filter((x) => !x.hasAttribute("disabled"));
      if (f.length === 0) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  const scene = scenes[view.scene];
  const item = flat[view.scene]?.[view.step];
  const beat = ended && view.scene === scenes.length - 1 ? scene.beats.length - 1 : (item?.beat ?? 0);
  const totalSteps = flat.reduce((a, f) => a + f.length, 0);
  const trackLabel = TRACKS.find((t) => t.id === lesson.track)?.label ?? "Grafik Analizi";

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 md:p-6" onClick={(e) => e.target === e.currentTarget && close()}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="vp-title"
        onKeyDown={onKeyDown}
        className={`flex h-full w-full flex-col overflow-hidden bg-bg pt-safe pb-safe ${isFs ? "" : "md:h-auto md:max-h-[92dvh] md:max-w-4xl md:rounded-2xl md:border md:border-line md:shadow-2xl"}`}
      >
        <header className="flex items-center gap-3 border-b border-line/70 px-4 py-2.5">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-accent">
            <Icon d={I.play} className="h-3 w-3" /> Videolu anlatım
          </span>
          <h2 id="vp-title" className="min-w-0 flex-1 truncate text-sm font-medium text-slate-200">
            {lesson.title}
          </h2>
          <button type="button" onClick={close} aria-label="Anlatımı kapat" className="rounded-lg p-1.5 text-slate-400 hover:bg-surface-2 hover:text-white">
            <Icon d={I.close} />
          </button>
        </header>

        <div ref={stageRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:min-h-[420px] md:px-8 md:py-7">
          <SceneView
            key={scene.id}
            scene={scene}
            lesson={lesson}
            beat={beat}
            reduced={reduced}
            trackLabel={trackLabel}
            onQuiz={close}
            onReplay={() => {
              setEnded(false);
              pos.current = { scene: 0, step: 0 };
              setView(pos.current);
              stopAll();
              setPlaying(true);
              runRef.current();
            }}
          />
        </div>

        <div className="min-h-[3.75rem] px-4 pb-1 md:px-8" aria-live={note || prefs.muted ? "polite" : "off"}>
          {prefs.subs && item && !ended && (
            <p className="mx-auto w-fit max-w-full rounded-lg bg-black/60 px-3 py-1.5 text-center text-[15px] leading-snug text-white md:text-base">{item.sub}</p>
          )}
        </div>

        {note && <p className="px-4 pb-1 text-center text-xs text-amber-300/90 md:px-8">{note}</p>}

        <div className="border-t border-line/70 px-3 pb-2 pt-2 md:px-6">
          <div className="flex gap-1" role="group" aria-label="Sahneler">
            {scenes.map((s, i) => {
              const fill = i < view.scene || ended ? 100 : i === view.scene ? ((view.step + (playing ? 1 : 0)) / Math.max(1, flat[i].length)) * 100 : 0;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => goScene(i)}
                  aria-label={`Sahne ${i + 1}: ${s.heading}`}
                  aria-current={i === view.scene ? "step" : undefined}
                  className="group relative h-4 min-w-2 py-1.5"
                  style={{ flexGrow: Math.max(1, flat[i].length) }}
                >
                  <span className="block h-1 overflow-hidden rounded-full bg-surface-2 group-hover:h-1.5">
                    <span className="block h-full rounded-full bg-accent motion-safe:transition-[width] motion-safe:duration-700" style={{ width: `${fill}%` }} />
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-1 flex items-center gap-1 md:gap-2">
            <button
              type="button"
              onClick={() => goScene(view.scene - 1)}
              disabled={view.scene === 0}
              aria-label="Önceki sahne"
              className="rounded-lg p-2 text-slate-300 hover:bg-surface-2 hover:text-white disabled:opacity-35"
            >
              <Icon d={I.prev} />
            </button>
            <button
              ref={playBtn}
              type="button"
              onClick={toggle}
              aria-label={playing ? "Duraklat" : ended ? "Baştan oynat" : "Oynat"}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-slate-950 hover:brightness-110"
            >
              <Icon d={playing ? I.pause : ended ? I.replay : I.play} className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => goScene(view.scene + 1)}
              disabled={view.scene === scenes.length - 1}
              aria-label="Sonraki sahne"
              className="rounded-lg p-2 text-slate-300 hover:bg-surface-2 hover:text-white disabled:opacity-35"
            >
              <Icon d={I.next} />
            </button>
            <span className="num ml-1 hidden truncate text-xs text-slate-500 sm:inline">
              Sahne {view.scene + 1} / {scenes.length} ·{" "}
              {Math.round(((flat.slice(0, view.scene).reduce((a, f) => a + f.length, 0) + view.step) / Math.max(1, totalSteps)) * 100)}%
            </span>
            <span className="flex-1" />
            <button
              type="button"
              onClick={() => updatePrefs({ speed: SPEEDS[(SPEEDS.indexOf(prefs.speed as (typeof SPEEDS)[number]) + 1) % SPEEDS.length] })}
              aria-label={`Anlatım hızı: ${prefs.speed.toLocaleString("tr-TR")} kat. Değiştirmek için tıkla`}
              className="num min-w-[3.25rem] rounded-lg border border-line px-2 py-1.5 text-xs font-semibold text-slate-200 hover:bg-surface-2"
            >
              {prefs.speed.toLocaleString("tr-TR")}x
            </button>
            <button
              type="button"
              onClick={() => updatePrefs({ muted: !prefs.muted })}
              aria-pressed={prefs.muted}
              aria-label={prefs.muted ? "Sesi aç" : "Sesi kapat"}
              className="rounded-lg p-2 text-slate-300 hover:bg-surface-2 hover:text-white"
            >
              <Icon d={prefs.muted ? I.mute : I.vol} />
            </button>
            <button
              type="button"
              onClick={() => updatePrefs({ subs: !prefs.subs })}
              aria-pressed={prefs.subs}
              aria-label={prefs.subs ? "Altyazıyı kapat" : "Altyazıyı aç"}
              className={`rounded-lg border px-1.5 py-1 text-[11px] font-bold ${prefs.subs ? "border-accent/60 text-accent" : "border-line text-slate-400"}`}
            >
              CC
            </button>
            {canFs && (
              <button
                type="button"
                onClick={toggleFs}
                aria-label={isFs ? "Tam ekrandan çık" : "Tam ekran"}
                className="rounded-lg p-2 text-slate-300 hover:bg-surface-2 hover:text-white"
              >
                <Icon d={isFs ? I.fsExit : I.fs} />
              </button>
            )}
          </div>
          <p className="hidden pb-0.5 text-[11px] text-slate-600 md:block">Klavye: Boşluk oynat/duraklat · ← → sahne · Esc kapat</p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function SceneView({
  scene,
  lesson,
  beat,
  reduced,
  trackLabel,
  onQuiz,
  onReplay,
}: {
  scene: VideoScene;
  lesson: Lesson;
  beat: number;
  reduced: boolean;
  trackLabel: string;
  onQuiz: () => void;
  onReplay: () => void;
}) {
  const points = (
    <ol className={`space-y-3 ${scene.visual ? "" : "mx-auto max-w-2xl"}`}>
      {scene.beats.map((b, i) => {
        const visible = i <= beat;
        const current = i === beat;
        return (
          <li
            key={i}
            aria-hidden={!visible}
            className={`flex gap-3 rounded-xl border-l-2 py-1 pl-3 text-[15px] leading-relaxed motion-safe:transition-all motion-safe:duration-500 md:text-lg ${
              visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
            } ${current ? "border-accent text-white" : "border-transparent text-slate-400"}`}
          >
            {scene.numbered && (
              <span
                className={`num mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${current ? "bg-accent text-slate-950" : "bg-surface-2 text-slate-300"}`}
              >
                {i + 1}
              </span>
            )}
            <span>{b.text}</span>
          </li>
        );
      })}
    </ol>
  );

  if (scene.kind === "intro") {
    return (
      <div className="flex min-h-full flex-col items-center justify-center py-6 text-center">
        <span className="text-xs font-medium uppercase tracking-wider text-accent">{trackLabel}</span>
        <h3 className="mt-2 max-w-2xl text-2xl font-semibold tracking-tight text-white md:text-4xl">{scene.heading}</h3>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-slate-300 md:text-lg">{scene.beats[0]?.text}</p>
        <span className="mt-5 h-1 w-16 rounded-full bg-accent/70" />
      </div>
    );
  }

  if (scene.kind === "end") {
    return (
      <div className="flex min-h-full flex-col items-center justify-center py-6 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/15 text-accent">
          <Icon d="M5 12.5l4.5 4.5L19 7.5" className="h-7 w-7" />
        </span>
        <h3 className="mt-4 text-2xl font-semibold tracking-tight text-white md:text-3xl">{scene.heading}</h3>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-slate-300 md:text-lg">{scene.beats[0]?.text}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <a
            href="#test"
            onClick={onQuiz}
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-slate-950 hover:brightness-110"
          >
            Mini sınava geç
            <Icon d="M9 6l6 6-6 6" className="h-4 w-4" />
          </a>
          <button
            type="button"
            onClick={onReplay}
            className="inline-flex items-center gap-2 rounded-xl border border-line px-4 py-2.5 text-sm font-medium text-slate-200 hover:bg-surface-2"
          >
            <Icon d={I.replay} className="h-4 w-4" /> Baştan izle
          </button>
        </div>
        <p className="mt-6 text-xs text-slate-500">{DISCLAIMER}</p>
      </div>
    );
  }

  const ex = scene.visual?.kind === "chart" ? lesson.examples[scene.visual.example] : undefined;
  return (
    <div>
      <h3 className="mb-4 text-xl font-semibold tracking-tight text-white md:mb-5 md:text-2xl">{scene.heading}</h3>
      {scene.visual ? (
        <div className="grid gap-5 md:grid-cols-[1.25fr_1fr] md:items-start">
          <div className="min-w-0">
            {ex ? (
              <div>
                <LessonChart spec={ex.chart} show={beat >= 1 || scene.beats.length === 1} />
                {ex.chart.legend && ex.chart.legend.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                    {ex.chart.legend.map((l) => (
                      <li key={l.label} className="flex items-center gap-1.5">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: l.color }} />
                        {l.label}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-1 text-[11px] text-slate-500">Örnek veri (gerçek bir varlık değildir)</p>
              </div>
            ) : (
              <DiagramReveal lesson={lesson} beat={beat} reduced={reduced} />
            )}
          </div>
          {points}
        </div>
      ) : (
        points
      )}
    </div>
  );
}
