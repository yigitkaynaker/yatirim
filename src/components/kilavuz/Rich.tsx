import Link from "next/link";
import { Fragment } from "react";
import { getTerm, hasTerm, type TermId } from "@/content/sozluk/terimler";

// Kılavuz / ders metnindeki küçük işaretleri çizer:
//   **kalın**, *eğik*, [[terim]] ya da [[terim|etiket]] → /sozluk#terim bağlantısı

const TOKEN = /(\*\*[^*]+\*\*|\*[^*]+\*|\[\[[a-z0-9-]+(?:\|[^\]]+)?\]\])/g;

export function Rich({ text }: { text: string }) {
  const parts = text.split(TOKEN);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith("**") && p.endsWith("**")) return <strong key={i} className="font-semibold text-slate-100">{p.slice(2, -2)}</strong>;
        if (p.startsWith("[[")) {
          const [id, label] = p.slice(2, -2).split("|");
          return (
            <Link key={i} href={`/sozluk#${id}`} className="text-sky-300 underline decoration-sky-300/40 underline-offset-2 hover:decoration-sky-300">
              {label ?? (hasTerm(id) ? getTerm(id as TermId).term : id)}
            </Link>
          );
        }
        if (p.length > 2 && p.startsWith("*") && p.endsWith("*")) return <em key={i}>{p.slice(1, -1)}</em>;
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}
