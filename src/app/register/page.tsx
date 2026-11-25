import type { Metadata } from "next";
import { Suspense } from "react";
import { RegisterForm } from "./RegisterForm";

export const metadata: Metadata = { title: "Kayıt ol" };

export default function RegisterPage() {
  return (
    <main className="pt-safe flex min-h-dvh items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="" width={64} height={64} className="rounded-2xl" />
          <h1 className="text-2xl font-semibold tracking-tight">Hesap oluştur</h1>
          <p className="text-sm text-slate-400">Portföyün ve verilerin yalnızca sana görünür.</p>
        </div>
        <Suspense>
          <RegisterForm />
        </Suspense>
      </div>
    </main>
  );
}
