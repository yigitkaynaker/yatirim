# Yatırım

Kişisel (tek kullanıcılı) yatırım uygulaması. Bilgisayarınızda çalışır; telefondan Tailscale üzerinden bağlanıp ana ekrana uygulama (PWA) olarak ekleyebilirsiniz.

**Aşama 1 içeriği:** şifreli giriş, gerçek ve sanal portföy, canlı fiyatlar, koşullu al/sat emirleri, uygulama içi bildirimler, kurulabilir PWA.

**Aşama 2 içeriği:** Piyasa sayfası (genel bakış, izleme listesi, fiyat grafikleri), portföy grafikleri (dağılım halkası, günlük değer çizgisi), Hesaplayıcılar sayfası ve 6 sekmeli mobil alt menü. Sohbet sayfası şimdilik yalnızca yer tutucu.

> **Güncellemeden sonra:** kod değiştiyse sunucuyu durdurup `npm run build` ile yeniden derleyin, sonra `npm start`. Eski derleme (`.next`) yeni sayfaları içermez.

## Kurulum ve çalıştırma

Gereken: Node.js 22.5 ya da üstü (geliştirildiği sürüm: 26). Python veya derleme aracı gerekmez; veritabanı Node'un yerleşik SQLite modülüdür (`node:sqlite`).

```bash
npm install
cp .env.example .env      # ilk kurulumsa; sonra .env dosyasını düzenleyin
npm run build
npm start                 # http://0.0.0.0:3000
```

Geliştirme modu için `npm run dev` kullanın. İki komut da `0.0.0.0:3000` adresini dinler, yani ağdaki diğer cihazlar da bağlanabilir.

Veriler `data/yatirim.db` dosyasında tutulur. Yedeklemek için sunucuyu durdurup bu dosyayı kopyalayın.

Diğer komutlar: `npm run lint`, `npm run typecheck`, `npm run icons` (ikonları yeniden üretir).

Çalışan sunucuya dokunmadan test derlemesi için: `NEXT_DIST_DIR=.next-test npm run build` (çıktı `.next-test` klasörüne yazılır). `YATIRIM_DATA_DIR` ile farklı bir veri klasörü kullanılabilir.

## Şifreyi değiştirme

`.env` dosyasında:

```
APP_PASSWORD=yeni-sifreniz
SESSION_SECRET=uzun-rastgele-bir-deger
```

Sonra sunucuyu yeniden başlatın. `SESSION_SECRET` değerini değiştirirseniz tüm açık oturumlar kapanır. Yeni bir rastgele değer üretmek için:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

`ANTHROPIC_API_KEY` alanı sonraki aşamadaki yapay zeka özellikleri için ayrılmıştır; şimdilik kullanılmıyor.

## Telefona kurulum (Tailscale)

1. Bilgisayara ve telefona [Tailscale](https://tailscale.com) kurun, ikisinde de aynı hesapla oturum açın.
2. Bilgisayarda uygulamayı başlatın (`npm start`).
3. **Önerilen yol (HTTPS):** Service worker ve tam PWA kurulumu için tarayıcılar HTTPS ister. Tailscale yönetim panelinde *DNS → MagicDNS* ve *HTTPS Certificates* seçeneklerini açın, sonra bilgisayarda şunu çalıştırın:
   ```bash
   tailscale serve --bg 3000
   ```
   Telefonda `https://<bilgisayar-adi>.<tailnet-adi>.ts.net` adresini açın. Bu adresi `tailscale serve status` komutu gösterir.
4. **Hızlı yol (HTTP):** Telefonda `http://<bilgisayarin-tailscale-ip>:3000` adresini açın. IP adresini `tailscale ip -4` komutu verir. Uygulama çalışır, ancak HTTP üzerinden service worker çalışmaz; uygulama tam PWA olarak değil, ana ekran kısayolu olarak eklenir.
5. Ana ekrana ekleme:
   - **iPhone (Safari):** Paylaş → *Ana Ekrana Ekle*
   - **Android (Chrome):** ⋮ menüsü → *Uygulamayı yükle* (ya da *Ana ekrana ekle*)
   - **Masaüstü (Chrome/Edge):** adres çubuğundaki *Yükle* simgesi

Windows Güvenlik Duvarı, Node.js için ağ izni isteyebilir. Tailscale ağı genellikle "Özel ağ" sayıldığından, bu ağa izin vermeniz yeterlidir.

## Özellikler

### Gerçek Portföy / Sanal Portföy
Ana sayfadaki iki sekme birbirinden tamamen ayrıdır ve toplamları hiçbir zaman karışmaz.

- **Gerçek:** alış ve satış işlemlerinizi (miktar, birim fiyat, para birimi, tarih, not) girersiniz. Pozisyon başına ağırlıklı ortalama maliyet, güncel değer ve K/Z (TL ve %) gösterilir. Gerçekleşen K/Z ayrıca hesaplanır.
- **Sanal ("alsaydım ne olurdu"):** bir varlık seçip **tutar** (örn. 10.000 TL) ya da **adet** girersiniz. Uygulama o anki canlı fiyatı alır ve adet = tutar / fiyat hesabını yapar (gerekirse kur çevrimiyle). Her pozisyon için giriş tarihi, giriş fiyatı, güncel fiyat, yatırılan tutar, güncel değer, K/Z ve geçen gün sayısı görünür.
- **"Gerçekten aldım" butonu:** sanal giriş bilgilerini forma doldurur. Gerçekte ödediğiniz fiyatı ve aldığınız miktarı düzeltip kaydedersiniz; pozisyon gerçek portföye geçer. Sanal kayıt silinmez, arşivlenir ve gerçek işleme bağlanır. Böylece ileride "planladığım ile gerçekleşen" karşılaştırılabilir.

USD ve EUR cinsinden varlıklar, toplamlarda güncel USDTRY/EURTRY kuruyla TL'ye çevrilir.

Sayı girerken ondalık için virgül, binlik için nokta kullanın: `12,5` ve `10.000`.

### Emirler (yalnızca uygulama içi)
*Emirler* sayfasından koşullu al/sat emri verebilirsiniz: varlık, Al/Sat yönü, koşul (fiyat ≤ ya da ≥ tetik fiyatı), tutar ya da adet ve hangi portföy (gerçek/sanal) olduğu.

- Sunucu çalıştığı sürece bekleyen emirler **30 saniyede bir** canlı fiyatlarla kontrol edilir.
- Koşul sağlanınca işlem, onay beklenmeden **otomatik olarak** ilgili portföye kaydedilir, emir "Gerçekleşti" olarak işaretlenir ve zil simgesindeki bildirim listesine bir bildirim düşer.
- Bir emir iki kez gerçekleşemez; bu, veritabanında atomik bir durum geçişiyle sağlanır.
- Eldekinden fazla satış gibi bir nedenle işlem kaydedilemezse emir "Başarısız" olarak kapanır ve bunun için de bildirim oluşturulur.
- **Aracı kurum ya da borsa bağlantısı yoktur; gerçek para hareketi olmaz.** "Gerçek" portföy emri yalnızca kaydınıza işlem ekler.

### Piyasa
- **Genel bakış:** BIST 100, USD/TRY, EUR/TRY, gram altın, ons altın, BTC, ETH, S&P 500, Nasdaq; günlük değişim (%) renkli gösterilir.
- **İzleme listesi:** *+ Ekle* ile sembol arayın (Yahoo Finance araması + Binance USDT pariteleri; “altın”, “dolar” gibi Türkçe kelimeler de çalışır). Liste veritabanında (`watchlist`) tutulur.
- **Detay:** bir varlığa dokunun; 1G/1H/1A/3A/1Y/5Y fiyat grafiği (hisse/döviz/altın: Yahoo, kripto: Binance mum verisi; grafik kütüphanesi: lightweight-charts). *Sanal al*, *Emir ver*, *İşlem ekle* düğmeleri mevcut formları varlık seçili olarak açar.

### Portföy grafikleri
- **Varlık dağılımı** halka grafiği.
- **Günlük değer çizgisi:** emir izleyici döngüsü gerçek ve sanal portföyün toplam değerini `portfolio_snapshots` tablosuna gün başına bir satır olarak yazar (gün içinde ~10 dk’da bir güncellenir, günün son değeri kalır). Grafik ilk kayıttan başlar; sunucu kapalıyken geçen günler için kayıt oluşmaz.

### Hesaplayıcılar
Mevduat getirisi (stopajlı net), birikim planı (bileşik getiri, yıllık tablo ve grafik), ortalama maliyet ve başabaş fiyatı, enflasyona göre reel getiri, canlı kurlarla döviz/altın çevirici. Her birinde yeni başlayanlar için açıklama vardır.

### Canlı fiyatlar
- **Hisse, döviz ve altın:** Yahoo Finance. BIST sembolleri `THYAO` gibi girilir, `.IS` eki otomatik eklenir. Döviz için `USDTRY=X` kullanılır. Gram altın = ons (GC=F) × USDTRY / 31,1035.
- **Kripto:** Binance (örn. `BTC` → BTCUSDT).
- Fiyatlar sunucuda 30 saniye önbellekte tutulur, ekran da yaklaşık 30 saniyede bir yenilenir. Bir kaynak yanıt vermezse son bilinen fiyat **"eski"** etiketiyle gösterilir.

## Kod yapısı (sonraki aşamalar için)

| Yol | İçerik |
|---|---|
| `src/lib/actions.ts` | **Eylem katmanı:** `addTransaction`, `createSanalPosition`, `promoteSanalToGercek`, `placeOrder`, `cancelOrder`, `getPortfolioSummary` gibi tüm okuma ve yazma işlemleri. API route'ları bunları kullanır; ileride Claude sohbeti de aynı fonksiyonları araç olarak çağıracak. |
| `src/lib/portfolio.ts` | İşlemler, pozisyon ve K/Z hesabı, sanal giriş ve dönüştürme |
| `src/lib/orders.ts`, `src/lib/orderWatcher.ts` | Emirler, bildirimler, emir izleyici (`src/instrumentation.ts` içinden bir kez başlatılır) |
| `src/lib/prices.ts` | Fiyat servisi (Yahoo + Binance, önbellek, "eski" fiyat desteği) |
| `src/lib/market.ts` | İzleme listesi, sembol arama, grafik verisi (eylemler: `listWatchlist`, `addToWatchlist`, `searchSymbols`, `getPriceChart`) |
| `src/lib/snapshots.ts` | Günlük portföy değeri kayıtları (`getPortfolioHistory`) |
| `src/lib/db.ts` | SQLite bağlantısı ve sürümlü şema geçişleri. Yeni tablo eklemek için `MIGRATIONS` dizisine yeni bir adım ekleyin. |
| `src/lib/auth.ts`, `src/proxy.ts` | İmzalı oturum çerezi ve sayfa/API koruması |
| `src/components/AppShell.tsx` | Menü. Yeni sayfalar için `NAV` dizisine bir satır eklemeniz yeterli. |
| `public/sw.js` | Service worker. Push bildirimleri ileride buraya eklenecek. |

Veri modeli yapay zeka analizine uygun tutuldu. Her işlemde `mode` (real/virtual), sanal girişte tutar ve fiyat zamanı, dönüştürme bağlantıları (`source_id`, `converted_to_id`) ve oluşturan emir (`order_id`) bulunur. Emirlerin `source` alanı `manuel` ya da `yapay_zeka` değerini alır.
