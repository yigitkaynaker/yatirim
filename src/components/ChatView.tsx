"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ActionCard } from "@/lib/chatTools";
import type { ChatEvent, Conversation, DisplayMessage } from "@/lib/chat";
import { fetchJson, goToLogin, UnauthorizedError } from "@/lib/usePolling";
import { AiMissingKey } from "./AiNotice";
import { confirmDialog } from "./ConfirmDialog";

interface ChatList {
  configured: boolean;
  sharedMissing?: boolean;
  budget: { spentUsd: number; budgetUsd: number; overBudget: boolean };
  conversations: Conversation[];
}

/** Yanıt beklerken oluşan geçici asistan mesajı */
interface Live {
  text: string;
  cards: ActionCard[];
  status: string | null;
  notices: { tone: "warning" | "error"; text: string }[];
}

const SUGGESTIONS = [
  "Gerçek portföyüm nasıl gidiyor?",
  "Sanal portföyüme 10.000 TL'lik THYAO ekle",
  "BTC 60.000$'a düşerse 5.000 TL'lik al emri ver",
  "Altın hakkında son haberler neler?",
];

/** Basit biçim: **kalın**, bağlantılar, satır sonları. HTML kullanılmaz. */
function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|https?:\/\/[^\s)]+)/g);
  return (
    <div className="whitespace-pre-wrap break-words">
      {parts.map((p, i) => {
        if (/^\*\*[^*]+\*\*$/.test(p)) return <b key={i}>{p.slice(2, -2)}</b>;
        if (/^https?:\/\//.test(p))
          return (
            <a key={i} href={p} target="_blank" rel="noreferrer" className="break-all text-sky-300 underline-offset-2 hover:underline">
              {p}
            </a>
          );
        return <span key={i}>{p}</span>;
      })}
    </div>
  );
}

function CardView({ card }: { card: ActionCard }) {
  if (card.tone === "warn") {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200" title="Yanıttaki bu rakamlar asistanın kullandığı araç sonuçlarında bulunamadı. Hesaplanmış ya da yanlış olabilir; önemli kararlarda ilgili sayfadan kontrol edin.">
        <span className="mr-1.5 rounded bg-amber-500/20 px-1.5 py-0.5 font-semibold">doğrulanamayan rakam</span>
        {card.lines.join(" · ")}
      </div>
    );
  }
  const ok = card.tone === "ok";
  return (
    <div className={`rounded-xl border px-3 py-2.5 text-sm ${ok ? "border-emerald-500/30 bg-emerald-500/10" : "border-rose-500/30 bg-rose-500/10"}`}>
      <div className={`flex items-center gap-2 font-medium ${ok ? "text-emerald-200" : "text-rose-200"}`}>
        <span aria-hidden>{ok ? "✓" : "✕"}</span>
        <span className="min-w-0 flex-1">{card.title}</span>
        {card.href && (
          <Link href={card.href} className="shrink-0 text-xs font-normal text-slate-400 hover:text-white">
            Aç ›
          </Link>
        )}
      </div>
      <ul className="num mt-1 space-y-0.5 text-slate-300">
        {card.lines.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
    </div>
  );
}

function Bubble({ m }: { m: Pick<DisplayMessage, "role" | "text" | "cards" | "sources"> }) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-violet-500/25 px-3.5 py-2.5 text-[15px]">
          <RichText text={m.text} />
        </div>
      </div>
    );
  }
  return (
    <div className="max-w-[95%] space-y-2">
      {m.cards.map((c, i) => (
        <CardView key={i} card={c} />
      ))}
      {m.text && (
        <div className="rounded-2xl rounded-bl-md border border-line bg-surface px-3.5 py-2.5 text-[15px] leading-relaxed">
          <RichText text={m.text} />
        </div>
      )}
      {m.sources.length > 0 && (
        <div className="flex flex-wrap gap-1.5 text-xs">
          <span className="text-slate-500">Kaynaklar:</span>
          {m.sources.slice(0, 8).map((s) => (
            <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="max-w-[16rem] truncate rounded-md bg-surface-2 px-1.5 py-0.5 text-sky-300 hover:underline">
              {s.title || new URL(s.url).host}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export function ChatView() {
  const [list, setList] = useState<ChatList | null>(null);
  const [convId, setConvId] = useState<number | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [pendingUser, setPendingUser] = useState<string | null>(null);
  const [live, setLive] = useState<Live | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [showList, setShowList] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const loadList = useCallback(async () => {
    try {
      setList(await fetchJson<ChatList>("/api/chat"));
    } catch (err) {
      if (err instanceof UnauthorizedError) goToLogin();
    }
  }, []);

  const openConversation = useCallback(async (id: number | null) => {
    setShowList(false);
    setConvId(id);
    setLive(null);
    setPendingUser(null);
    if (id == null) return setMessages([]);
    try {
      const d = await fetchJson<{ messages: DisplayMessage[] }>(`/api/chat/${id}`);
      setMessages(d.messages);
    } catch (err) {
      if (err instanceof UnauthorizedError) return goToLogin();
      setMessages([]);
      setConvId(null);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, live, pendingUser]);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function sendMessage(text: string) {
    const msg = text.trim();
    if (!msg || busy) return;
    setInput("");
    setBusy(true);
    setPendingUser(msg);
    setLive({ text: "", cards: [], status: "Düşünüyor…", notices: [] });
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let id = convId;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: convId, message: msg }),
        signal: ctrl.signal,
      });
      if (res.status === 401) return goToLogin();
      if (!res.ok || !res.body) throw new Error("Sunucuya ulaşılamadı.");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const e = JSON.parse(line) as ChatEvent;
          if (e.type === "conversation") {
            id = e.id;
            setConvId(e.id);
          }
          setLive((l) => {
            if (!l) return l;
            switch (e.type) {
              case "text":
                return { ...l, text: l.text + e.delta, status: null };
              case "status":
                return { ...l, status: e.text, text: l.text && !l.text.endsWith("\n") ? l.text + "\n\n" : l.text };
              case "card":
                return { ...l, cards: [...l.cards, e.card] };
              case "warning":
                return { ...l, notices: [...l.notices, { tone: "warning", text: e.message }] };
              case "error":
                return { ...l, status: null, notices: [...l.notices, { tone: "error", text: e.message }] };
              case "done":
                return { ...l, status: null };
              default:
                return l;
            }
          });
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setLive((l) => (l ? { ...l, status: null, notices: [...l.notices, { tone: "error", text: (err as Error).message || "Bağlantı kesildi." }] } : l));
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
    // Kaydedilmiş hâli yükle; hata/uyarı notlarını koru.
    if (id != null) {
      try {
        const d = await fetchJson<{ messages: DisplayMessage[] }>(`/api/chat/${id}`);
        setMessages(d.messages);
        setPendingUser(null);
        setLive((l) => (l && l.notices.length ? { text: "", cards: [], status: null, notices: l.notices } : null));
      } catch {
        // geçici hâl ekranda kalır
      }
    }
    void loadList();
  }

  if (!list || !list.configured) {
    return (
      <div className="flex h-[calc(100dvh-12rem)] flex-col md:h-[calc(100dvh-8rem)]">
        <h1 className="mb-3 text-xl font-semibold tracking-tight">Sohbet</h1>
        <div className="flex flex-1 flex-col justify-center">{list ? <AiMissingKey shared={list.sharedMissing} /> : <p className="text-center text-sm text-slate-500">Yükleniyor…</p>}</div>
      </div>
    );
  }

  const empty = messages.length === 0 && !pendingUser;

  return (
    <div className="flex h-[calc(100dvh-12rem)] flex-col md:h-[calc(100dvh-8rem)]">
      <div className="mb-3 flex items-center gap-2">
        <h1 className="text-xl font-semibold tracking-tight">Sohbet</h1>
        <div className="ml-auto flex gap-2">
          {list && list.conversations.length > 0 && (
            <button onClick={() => setShowList((v) => !v)} className="rounded-xl border border-line px-3 py-1.5 text-sm text-slate-300 hover:bg-surface-2">
              Geçmiş ({list.conversations.length})
            </button>
          )}
          <button
            onClick={() => void openConversation(null)}
            disabled={busy}
            className="rounded-xl bg-violet-500 px-3 py-1.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
          >
            Yeni sohbet
          </button>
        </div>
      </div>

      {list?.budget.overBudget && (
        <p className="mb-2 rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Bu ayki bütçe doldu (${list.budget.spentUsd.toFixed(2)} / ${list.budget.budgetUsd.toFixed(2)}). Sohbet çalışmaya devam eder ama harcama artar.
        </p>
      )}

      {showList && list && (
        <div className="mb-3 max-h-60 overflow-y-auto rounded-2xl border border-line bg-surface">
          <ul className="divide-y divide-line/70">
            {list.conversations.map((c) => (
              <li key={c.id} className="flex items-center">
                <button
                  onClick={() => void openConversation(c.id)}
                  className={`min-w-0 flex-1 px-4 py-2.5 text-left text-sm hover:bg-surface-2 ${c.id === convId ? "text-violet-200" : ""}`}
                >
                  <div className="truncate">{c.title}</div>
                  <div className="text-xs text-slate-500">{new Date(c.updatedAt.replace(" ", "T") + "Z").toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" })}</div>
                </button>
                <button
                  onClick={async () => {
                    if (!(await confirmDialog("Bu sohbet silinsin mi?", { confirmLabel: "Sil", danger: true }))) return;
                    await fetch(`/api/chat/${c.id}`, { method: "DELETE" });
                    if (c.id === convId) void openConversation(null);
                    void loadList();
                  }}
                  className="px-3 py-2 text-xs text-slate-500 hover:text-rose-300"
                  aria-label="Sohbeti sil"
                >
                  Sil
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex-1 space-y-3 overflow-y-auto rounded-2xl border border-line bg-bg/40 p-3 md:p-4">
        {empty && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <p className="font-medium">Merhaba! Portföyünüz hakkında sorabilir ya da işlem yaptırabilirsiniz.</p>
            <p className="mt-1 max-w-md text-sm text-slate-500">
              Asistan istediğinizde işlemi doğrudan yapar ve sonucu kart olarak gösterir. Emirler yalnızca uygulama içinde gerçekleşir.
            </p>
            <div className="mt-4 flex max-w-lg flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => void sendMessage(s)} className="rounded-full border border-line bg-surface px-3 py-1.5 text-sm text-slate-300 hover:bg-surface-2">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <Bubble key={m.id} m={m} />
        ))}
        {pendingUser && <Bubble m={{ role: "user", text: pendingUser, cards: [], sources: [] }} />}
        {live && (
          <div className="space-y-2">
            {(live.text || live.cards.length > 0) && <Bubble m={{ role: "assistant", text: live.text, cards: live.cards, sources: [] }} />}
            {live.status && (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <span className="h-2 w-2 animate-pulse rounded-full bg-violet-400" />
                {live.status}
              </div>
            )}
            {live.notices.map((n, i) => (
              <p key={i} className={`rounded-xl px-3 py-2 text-sm ${n.tone === "error" ? "bg-rose-500/10 text-rose-300" : "bg-amber-500/10 text-amber-200"}`}>
                {n.text}
                {/Ayarlar/.test(n.text) && (
                  <>
                    {" "}
                    <Link href="/ayarlar" className="underline">
                      Ayarlar
                    </Link>
                  </>
                )}
              </p>
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void sendMessage(input);
        }}
        className="mt-3 flex gap-2"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void sendMessage(input);
            }
          }}
          rows={1}
          placeholder="Mesajınızı yazın…"
          disabled={!list}
          className="max-h-32 min-h-[2.75rem] flex-1 resize-none rounded-xl border border-line bg-surface px-3.5 py-2.5 outline-none focus:border-violet-400"
        />
        {busy ? (
          <button type="button" onClick={() => abortRef.current?.abort()} className="rounded-xl border border-line px-4 py-2.5 text-sm text-slate-300">
            Durdur
          </button>
        ) : (
          <button type="submit" disabled={!input.trim() || !list} className="rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50">
            Gönder
          </button>
        )}
      </form>
      <p className="mt-1.5 text-center text-[11px] text-slate-500">Yapay zeka hata yapabilir. Yanıtlar yatırım tavsiyesi değildir.</p>
    </div>
  );
}
