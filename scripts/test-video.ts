// Videolu anlatım sahne üretimi testleri (src/content/egitim/video.ts). Ağ ve veritabanı kullanmaz.
//   npm run test:video
import assert from "node:assert/strict";

const { LESSONS } = await import("../src/content/egitim/index");
const { buildScenes, chunkSentence, splitSentences, toSpeech, MAX_CHUNK } = await import("../src/content/egitim/video");

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

test("cümle bölme: kısaltma ve binlik ayıracı bölünmez", () => {
  assert.deepEqual(splitSentences("Fiyat 1.000 TL oldu. Örn. altın gibi varlıklar da var! Son cümle?"), [
    "Fiyat 1.000 TL oldu.",
    "Örn. altın gibi varlıklar da var!",
    "Son cümle?",
  ]);
});

test("uzun cümle MAX_CHUNK'tan kısa parçalara bölünür, metin kaybolmaz", () => {
  const long = Array.from({ length: 30 }, (_, i) => `parça ${i}`).join(", ") + ".";
  const parts = chunkSentence(long);
  assert.ok(parts.length > 1);
  for (const p of parts) assert.ok(p.length <= MAX_CHUNK, p);
  assert.equal(parts.join(" ").replace(/\s+/g, " "), long);
});

test("seslendirme metninde işaret okunmaz", () => {
  assert.equal(toSpeech('**Makas:** 50 TL → "fark" ≈ %1,7'), "Makas: 50 TL, fark yaklaşık %1,7");
});

test("her ders en az 2 sahne üretir, giriş ve sınav kapanışıyla", () => {
  for (const l of LESSONS) {
    const scenes = buildScenes(l);
    assert.ok(scenes.length >= 2, `${l.slug}: ${scenes.length} sahne`);
    assert.equal(scenes[0].kind, "intro", l.slug);
    assert.equal(scenes.at(-1)!.kind, "end", l.slug);
    assert.ok(
      scenes.some((s) => s.kind === "content"),
      `${l.slug}: içerik sahnesi yok`,
    );
    assert.equal(new Set(scenes.map((s) => s.id)).size, scenes.length, `${l.slug}: yinelenen sahne kimliği`);
  }
});

test("her sahnede boş olmayan anlatım; altyazı ile seslendirme eşleşir; işaret okunmaz", () => {
  for (const l of LESSONS) {
    for (const s of buildScenes(l)) {
      assert.ok(s.heading.trim(), `${l.slug}/${s.id}: başlık boş`);
      assert.ok(s.beats.length > 0, `${l.slug}/${s.id}: madde yok`);
      for (const b of s.beats) {
        assert.ok(b.text.trim(), `${l.slug}/${s.id}: madde metni boş`);
        assert.equal(b.say.length, b.subtitles.length, `${l.slug}/${s.id}`);
        assert.ok(!/\*\*|[*_#`]/.test(b.text), `${l.slug}/${s.id}: ekranda markdown: ${b.text}`);
        for (const t of b.say) {
          assert.ok(t.trim().length > 0, `${l.slug}/${s.id}: boş anlatım`);
          assert.ok(t.length <= MAX_CHUNK, `${l.slug}/${s.id}: çok uzun parça (${t.length})`);
          assert.ok(!/[*_#`→⇒≈−÷×"“”\\[\]{}<>|]/.test(t), `${l.slug}/${s.id}: okunacak işaret: ${t}`);
        }
      }
      if (s.visual?.kind === "diagram") assert.ok(l.diagram, `${l.slug}: çizim yok`);
      if (s.visual?.kind === "chart") assert.ok(l.examples[s.visual.example], `${l.slug}: örnek yok`);
    }
  }
});

test("elle yazılmış senaryo orta sahnelerin yerini alır", () => {
  const base = LESSONS.find((l) => l.diagram)!;
  const scenes = buildScenes({
    ...base,
    video: { scenes: [{ heading: "Özel", points: ["Birinci madde", "İkinci madde"], narration: ["Birinci maddeyi uzun anlatırız."], visual: "diagram" }] },
  });
  assert.deepEqual(
    scenes.map((s) => s.kind),
    ["intro", "content", "end"],
  );
  assert.equal(scenes[1].beats[0].say[0], "Birinci maddeyi uzun anlatırız.");
  assert.equal(scenes[1].beats[1].say[0], "İkinci madde");
  assert.deepEqual(scenes[1].visual, { kind: "diagram" });
});

console.log(`\n${passed} test geçti (${LESSONS.length} ders).`);
