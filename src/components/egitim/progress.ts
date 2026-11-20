"use client";

import { useMemo, useSyncExternalStore } from "react";

// Ders ilerlemesi yalnızca bu tarayıcıda (localStorage) tutulur; sunucuya gitmez.
// Gizli sekme ya da engellenmiş depolama gibi durumlarda sessizce boş liste döner.

const KEY = "yatirim:egitim:tamamlanan";
const EVENT = "egitim-progress";

function read(): string {
  try {
    return window.localStorage.getItem(KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
}

function parse(raw: string): string[] {
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function setLessonDone(slug: string, done: boolean) {
  const list = new Set(parse(read()));
  if (done) list.add(slug);
  else list.delete(slug);
  try {
    window.localStorage.setItem(KEY, JSON.stringify([...list]));
  } catch {
    // Depolama kullanılamıyor; ilerleme bu oturumda kaydedilemez.
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Tamamlanan derslerin kümesi. Sunucuda ve ilk çizimde boş döner. */
export function useCompletedLessons(): Set<string> {
  const raw = useSyncExternalStore(subscribe, read, () => "[]");
  return useMemo(() => new Set(parse(raw)), [raw]);
}
