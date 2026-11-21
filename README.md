# Yatırım

Kişisel (tek kullanıcılı) yatırım uygulaması. Bilgisayarınızda çalışır; telefondan Tailscale üzerinden bağlanıp ana ekrana uygulama (PWA) olarak ekleyebilirsiniz.

**Aşama 1 içeriği:** şifreli giriş, gerçek ve sanal portföy, canlı fiyatlar, koşullu al/sat emirleri, uygulama içi bildirimler, kurulabilir PWA.

**Aşama 2 içeriği:** Piyasa sayfası (genel bakış, izleme listesi, fiyat grafikleri), portföy grafikleri (dağılım halkası, günlük değer çizgisi), Hesaplayıcılar sayfası ve mobil alt menü.

**Aşama 3 içeriği:** Claude yapay zekası ile işlem yapabilen Sohbet, otomatik ve elle haber analizi (Analizler sayfası), Ayarlar sayfası (API anahtarı, model, tarama takvimi, aylık bütçe) ve telefona/masaüstüne anlık (push) bildirimler.

**Aşama 4 içeriği:** teknik analiz sinyalleri (RSI, MACD, hareketli ortalamalar, Bollinger, hacim), varlık detayında Teknik Analiz bölümü ve grafik katmanları, Sinyaller sayfası, günlük sinyal değişimi bildirimleri, sohbette ve haber analizinde teknik sinyaller.

**Geliştirme paketi A:** "Bugün" K/Z ve fiyat zamanı / gecikme etiketleri, TEFAS yatırım fonları, altın türleri (çeyrek, yarım, tam, cumhuriyet, ata, 22 ayar bilezik), temettü takibi (Temettü sayfası), KAP bildirimleri (KAP sayfası) ve pozisyon detay sayfası.

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

Veriler `data/yatirim.db` dosyasında tutulur. Uygulama her gün `data/yedekler/` klasörüne otomatik yedek alır (son 14); Ayarlar › *Yedekleme* bölümünden elle yedek alabilir, indirebilir ve geri yükleyebilirsiniz. Şema güncellemesinden önce de otomatik yedek alınır.

Diğer komutlar: `npm run lint`, `npm run typecheck`, `npm run test:indicators` (gösterge motorunun birim testleri), `npm run test:sources` (temettü hak edişi, TEFAS sıfır fiyat, altın kaynağı ve "bugün" değişimi testleri), `npm run test:fx` (işlem tarihi kuruyla TL K/Z ve kur etkisi testleri), `npm run icons` (ikonları yeniden üretir), `npm run test:ai` (yapay zeka katmanının sahte istemciyle testi; `YATIRIM_DATA_DIR` ile ayrı bir veri klasörü gösterin, gerçek API çağrısı yapmaz).

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

`ANTHROPIC_API_KEY` doldurulursa yapay zeka bu anahtarı kullanır. Boş bırakıp anahtarı **Ayarlar** sayfasından da yapıştırabilirsiniz; ikisi de varsa .env önceliklidir.

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

USD ve EUR cinsinden varlıklarda TL **güncel değer** bugünkü USDTRY/EURTRY kuruyla, TL **maliyet** ve gerçekleşen TL K/Z ise her işlemin kendi tarihindeki kurla hesaplanır (işleme kaydedilir: bugünkü işlemde canlı kur, geçmiş tarihli işlemde Yahoo'daki o günün kapanışı). Böylece TL K/Z alıştan bu yana kurdaki değişimi de içerir; pozisyon listesinde TL K/Z'nin altında **Fiyat etkisi** ve **Kur etkisi** ayrı gösterilir. Varlığın kendi para birimindeki (USD) maliyet ve K/Z değişmez. Eski kayıtların kuru ilk açılışta otomatik doldurulur; kur alınamazsa geçici olarak güncel kur kullanılır (* işareti) ve birkaç dakika sonra yeniden denenir.

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
- **Günlük değer çizgisi:** emir izleyici döngüsü gerçek ve sanal portföyün toplam değerini `portfolio_snapshots` tablosuna gün başına bir satır olarak yazar (gün içinde ~10 dk’da bir güncellenir, günün son değeri kalır; fiyatlar bayatken kayıt yazılmaz). Grafik ilk kayıttan başlar; sunucu kapalıyken geçen günler için kayıt oluşmaz.

### Hesaplayıcılar
Mevduat getirisi (stopajlı net), birikim planı (bileşik getiri, yıllık tablo ve grafik), ortalama maliyet ve başabaş fiyatı, enflasyona göre reel getiri, canlı kurlarla döviz/altın çevirici. Her birinde yeni başlayanlar için açıklama vardır.

### Yapay zeka (Aşama 3)
Anahtar yokken tüm yapay zeka ekranları "Yapay zeka anahtarı eklenmedi — Ayarlar'dan ekleyin" uyarısı gösterir; uygulamanın geri kalanı normal çalışır.

- **Ayarlar** (üst çubuktaki dişli simgesi): API anahtarı (console.anthropic.com › Billing'den kredi yükleyin, API Keys'ten anahtar oluşturun, yapıştırın). Anahtar veritabanında saklanır, maskeli gösterilir, silinebilir. *Bağlantıyı test et* çok küçük bir istekle anahtarı ve krediyi dener. Model: **Ekonomik** (Claude Haiku 5.5, varsayılan) ya da **Gelişmiş** (Claude Sonnet 5.5, ~20 kat pahalı). Otomatik tarama saatleri (varsayılan hafta içi 09:45, 13:00, 18:30, İstanbul saati; kapatılabilir), tarama başına en fazla web araması (varsayılan 3) ve aylık bütçe (varsayılan 10 $).
- **Maliyet:** her API çağrısı `ai_usage` tablosuna token, arama ve tahmini maliyetle yazılır; "Bu ay tahmini harcama" Ayarlar ve Analizler'de görünür. Web araması (~0,01 $/arama) maliyetin büyük kısmıdır. Bütçe dolunca otomatik taramalar durur; sohbet ve elle analiz uyarıyla çalışmaya devam eder.
- **Sohbet:** yanıtlar akış hâlinde gelir, sohbetler kaydedilir (*Geçmiş*, *Yeni sohbet*). Asistan portföyü, fiyatları, emirleri ve son haber raporunu okuyabilir, gerekirse webde arar. Açıkça istediğinizde işlemi **onay sormadan yapar**: sanal pozisyon açma, sanalı gerçeğe alma, işlem ekleme, emir verme/iptal. Her işlem sohbette rakamlarıyla bir kart olarak görünür. Yapay zekanın verdiği emirlerin kaynağı `yapay_zeka`, eklediği işlemlerin notu "Yapay zeka sohbetiyle" olur. Belirsiz talimatlarda (hangi pozisyon, ne kadar) önce sorar.
- **Analizler:** gerçek + sanal pozisyonlar, izleme listesi ve bekleyen emirlerdeki varlıklar (en fazla 20) için haber taraması. Varlık başına duygu (olumlu/olumsuz/nötr), önem (1–5), kısa özet, pozisyona olası etki ve kaynak bağlantıları; ayrıca genel piyasa özeti. *Şimdi analiz et* (tümü) ya da varlık detay sayfasındaki *Bu varlığı analiz et*. Önemi 4+ olan maddeler bildirim üretir. Otomatik tarama yalnızca sunucu çalışırken yapılır (saatten sonra en geç 60 dk içinde).
- **Anlık bildirimler:** Ayarlar › *Bildirimleri aç* bu cihazı abone eder (birden fazla cihaz olabilir). Emir gerçekleşince/başarısız olunca ve önemli haberlerde gönderilir. VAPID anahtarları ilk kullanımda üretilip veritabanında saklanır. Tarayıcılar bunun için HTTPS ister: bilgisayarda `localhost` çalışır, telefonda `tailscale serve` ile açılan https adresini kullanın (iPhone'da önce ana ekrana ekleyin).
- Yanıtlar ve analizler yatırım tavsiyesi değildir.

### Teknik sinyaller (Aşama 4)
- **Göstergeler** (günlük kapanışlarla, ~2 yıllık veri, 30 dk önbellek): SMA ve EMA 20/50/200, RSI(14), MACD(12,26,9), Bollinger(20,2), son hacmin 20 günlük ortalamaya oranı. Hisse/döviz/altın: Yahoo, kripto: Binance.
- **Özet sinyal:** RSI bölgeleri, MACD kesişimi, fiyatın SMA50/SMA200'e göre yeri, altın/ölüm kesişimi, Bollinger bandına temas ve hacim teyidi puanlanır; toplam puana göre **Güçlü Al / Al / Nötr / Sat / Güçlü Sat**. Kurallar, puanlar ve eşikler tek dosyadadır: `src/lib/signalRules.ts` (`RULES`).
- **Varlık detayı:** *Teknik Analiz* bölümü (rozet, nedenler, gösterge değerleri ve sade açıklamaları); grafikte SMA 50 / SMA 200 / Bollinger katmanları ve altta RSI paneli.
- **Sinyaller sayfası:** gerçek + sanal pozisyonlar ve izleme listesindeki varlıklar; sinyal, RSI, değişim ya da ada göre sıralanır. Telefonda alt çubuktaki *Daha fazla* menüsünde, Piyasa sayfasında da bağlantısı var.
- **Sinyal uyarıları:** her gün 19:00'dan sonra (İstanbul) emir izleyici döngüsü sinyalleri bir kez kontrol eder (`technical_signals` tablosu, `scheduled_runs` ile çift çalışma engellenir). Bir varlığın özeti değişirse bildirim + push. Ayarlar'dan kapatılabilir.
- **Yapay zeka:** sohbette `get_technical_signals` aracı; haber analizi istemine varlık başına teknik özet eklenir.
- Teknik sinyaller geçmiş fiyatlara dayanır, geleceği garanti etmez; yatırım tavsiyesi değildir.

### Canlı fiyatlar
- **Hisse, döviz ve altın:** Yahoo Finance. BIST sembolleri `THYAO` gibi girilir, `.IS` eki otomatik eklenir. Döviz için `USDTRY=X` kullanılır. Gram altın = ons (GC=F) × USDTRY / 31,1035.
- **Kripto:** Binance (örn. `BTC` → BTCUSDT).
- Fiyatlar sunucuda 30 saniye önbellekte tutulur, ekran da yaklaşık 30 saniyede bir yenilenir. Bir kaynak yanıt vermezse son bilinen fiyat **"eski"** etiketiyle gösterilir.

### Paket A: günlük K/Z, fonlar, altın türleri, temettü, KAP
- **Bugün:** portföy toplamında ve her pozisyonda önceki kapanışa göre bugünkü değişim (TL ve %), gerçek ve sanal. Bugün yapılan alış/satışlar işlem fiyatından hesaplanır; hafta sonu son seans gösterilir. Her fiyatın yanında kaynağı ve zamanı, BIST için **gecikmeli (15 dk)**, kaynak yanıt vermiyorsa **eski · son güncelleme** etiketi vardır.
- **Fon (TEFAS):** yeni varlık türü. Aramada 3 harfli fon kodu yazın (örn. AFT); kod TEFAS'ta doğrulanır. Fiyat günde bir açıklanır (30 dk önbellek); 0 dönen fiyatlar geçersiz sayılır, son geçerli fiyat kullanılır. Detay sayfasında 1A–5Y grafik.
- **Altın türleri:** gram (eskisi gibi ons × kur), çeyrek, yarım, tam, cumhuriyet, ata, 22 ayar bilezik (gram). Kaynak: Truncgil, yedek Genelpara; ikisi de yoksa gram altından "yaklaşık". Değer kuyumcu **satış** fiyatıyla; alış fiyatı ve makas açıklaması gösterilir. Sikke grafikleri gram altından ölçeklenir (yaklaşık).
- **Temettü:** Yahoo'dan hisse başına temettü geçmişi (BIST ve ABD). Hak kullanım gününden önceki gün elinizde olan hisseler için "Temettü geliri" önerisi çıkar; **Onayla** ile hak kullanım günü kuruyla `dividends` tablosuna yazılır ve gerçekleşen K/Z'ye eklenir. Temettü sayfası: yıllara göre alınanlar, onay bekleyenler, yaklaşanlar (KAP kâr payı bildirimleri), hisse başına geçmiş. Sohbette `list_dividends` aracı.
- **KAP:** hafta içi 08:00–22:00 arası en fazla 10 dakikada bir KAP'tan tarih aralığıyla bildirimler çekilir; portföy (gerçek + sanal) ve izleme listesindeki BIST hisseleriyle ilgili olanlar `kap_disclosures` tablosunda saklanır. KAP sayfası ve varlık detayında başlık, özet, zaman ve kap.org.tr bağlantısı. Pozisyon hisseleri için bildirim + push (Ayarlar: yalnız gerçek / gerçek + sanal / kapalı). Son 48 saatin KAP bildirimleri haber analizi istemine ve sohbete ücretsiz bağlam olarak eklenir (`get_kap_disclosures` aracı).
- **Pozisyon detayı:** Portföy'de bir satıra dokununca `/portfoy/pozisyon?mod=gercek|sanal&id=…` açılır: özet (miktar, maliyet, değer, K/Z, fiyat/kur etkisi, bugün, gün sayısı), alış/satış işaretli ve "Maliyetin" çizgili grafik (üstü yeşil, altı kırmızı), "Yatırımımın değeri" grafiği, işlemler, teknik sinyal, bekleyen emirler, temettü, KAP ve son haber analizi; Al/Sat/Emir ver ya da Gerçekten aldım/Sanal sat düğmeleri.
- Dış kaynaklar tarayıcı User-Agent'ı ile, önbellekli ve hata alınca artan bekleme süresiyle (`src/lib/http.ts`) sorgulanır; hata durumunda son bilinen veri gösterilir.

### Geliştirme paketi B: alarmlar, ücretsiz haberler, özet, risk
- **Alarmlar** (`/alarmlar`, varlık ve pozisyon sayfasında *Alarm kur*): işlem yapmaz, yalnızca bildirim + push. Türler: fiyat eşiği, günlük % değişim, maliyete göre % (gerçek/sanal), hacim patlaması (bugünkü hacim / 20 günlük ortalama), teknik sinyal değişimi; izleme listesinin tümü için de kurulabilir. Süresi dolmaz; *tek sefer* ya da *her seferinde* (bekleme süresiyle). Koşul sürdükçe tekrar çalmaz. Sohbette `create_alarm`, `list_alarms`, `delete_alarm`. Mantık: `src/lib/alarmLogic.ts` (saf), servis: `src/lib/alarms.ts`.
- **Ücretsiz haber başlıkları:** Google Haberler RSS (+ yabancı hisse/kripto için Yahoo Finance RSS), 20 dk önbellek, başlığa göre tekilleştirme. Varlık/pozisyon sayfasında *Son haberler*. Haber taraması önce bu başlıkları ve KAP'ı kullanır; ücretli web araması yalnızca yetersizse (varsayılan en fazla 2). Ayarlar'da *Bu ay ücretsiz kaynaklarla tasarruf*.
- **Yapay zeka güvenilirliği:** araç sonucunda ya da bağlamda olmayan rakamlar "doğrulanamayan rakam" olarak işaretlenir (`src/lib/numberCheck.ts`); fiyat araçları veri zamanı döndürür; analizlerde olumlu/olumsuz senaryo ve güven düzeyi.
- **Günlük özet:** hafta içi 18:45'ten sonra bir kez, yalnızca önbellekteki verilerden (web araması yok), ucuz modelle; anahtar yoksa kurallı özet. Portföy sayfasının üstünde ve bildirim olarak. **Neden hareket ediyor?** günlük hareketi %3 ve üstü varlıklarda (RSS + KAP).
- **Piyasa duygusu:** kripto Korku & Açgözlülük endeksi (kaynak: alternative.me, günde bir kez).
- **Kıyaslama ve risk:** Portföy'de "Portföyüm vs BIST 100 / Dolar / Gram altın" (zaman ağırlıklı getiri, 100'e endeksli), pozisyonda "aldığımdan beri"; Risk kartı (yoğunlaşma, ilk 3, varlık türü, döviz payı, oynaklık) ve isteğe bağlı hedef dağılım ile dengeleme önerisi (`src/lib/perfMath.ts`).
- **Düzeltmeler:** altın elde tutulurken kuyumcu *alış* fiyatıyla değerlenir (alışta varsayılan *satış* fiyatı); temettü önerileri stopaj sonrası net (Ayarlar'dan oran) ve bölünmeye göre düzeltilir, kayıtlı temettü yeniden onaylanınca üzerine yazılmaz (409, *Düzenle* ile değiştirilir); eski fon fiyatıyla emir/alarm tetiklenmez; KAP boşluk kalmadan geriye doldurulur.
- Testler: `npm run test:batchb` (alarm, RSS, rakam kontrolü, getiri/risk ve düzeltmelerin birim testleri).

### Geliştirme paketi C: hesaplar, komisyon, yedek, CSV, rapor, yıllık getiri, not
- **Birden çok hesap** (Midas, İş Yatırım, Banka, Altın kasası…): her gerçek işlem, emir, temettü ve alarm bir hesaba aittir; eski kayıtlar "Ana hesap"a taşındı. Pozisyonlar ve ortalama maliyet hesap başına hesaplanır. Portföy'de hesap çipleri, *Hesaplarım* kartı (hesap başına toplam, *Toplama dahil* anahtarı); pozisyon sayfasında *Hesaplara göre* kırılımı ve hesap filtresi. Ayarlar › *Hesaplar*: ekle, yeniden adlandır, varsayılan komisyon %, arşivle (açık pozisyonlu hesap arşivlenemez). Sanal portföy tek hesaptır. Sohbet araçları isteğe bağlı `account` (hesap adı) alır.
- **Komisyon:** işlemde tutar ya da % (boşsa hesabın oranı); alışta maliyete, satışta gelire yansır, gerçekleşen K/Z'ye girer. Emirler hesabın oranıyla gerçekleşir. Pozisyon sayfasında *Şimdi satarsam* kutusu (komisyon sonrası tahmini net tutar ve varlık türüne göre stopaj notu; tahmini, vergi/yatırım tavsiyesi değildir).
- **Yedekleme:** `VACUUM INTO` ile çalışırken güvenli; günlük otomatik (son 14), *Şimdi yedekle*, indirme, *Yedekten geri yükle* (dosya doğrulanır, iki kez onay, önce mevcut veri yedeklenir).
- **CSV (Excel-TR):** Rapor & veri sayfasından işlemler, pozisyonlar, temettüler ve gerçekleşen kazanç dışa aktarılır (UTF-8 BOM, `;`, ondalık virgül, gg.aa.yyyy). İşlem içe aktarma: şablon, sütun eşleme (başka kurum dosyaları), satır satır hata gösteren önizleme, mükerrer kontrolü (tarih, sembol, yön, adet, fiyat, hesap) ve tek veritabanı işleminde (ya hep ya hiç) kayıt.
- **Yıllık gerçekleşen kazanç raporu:** yıl → varlık; işlem günü kurlarıyla TL gerçekleşen K/Z, temettü brüt / stopaj / net, komisyon. Resmî vergi beyanı değildir.
- **Yıllık getiri (XIRR):** paranın ne zaman girdiğini hesaba katan yıllık getiri; pozisyon, hesap ve portföy için (en az 30 günlük geçmiş). `src/lib/xirr.ts`.
- **Pozisyon notu:** "Neden aldım?", "Ne olursa satarım?", hedef ve stop fiyatı. Grafikte kesikli çizgiler; satış formunda hatırlatma; *Hedef/stop için alarm kur* (fiyat alarmı); stop alarmı çalınca bildirimde satış planı hatırlatılır.
- **Sanal gerçeklik kontrolü:** Sanal sekmesinde ve "Gerçekten aldım" penceresinde işlem sayısı, kazanan/kaybeden, en iyi/kötü, en büyük düşüş ve tahmini komisyon.
- Testler: `npm run test:batchc` (XIRR bilinen değerler, komisyonlu maliyet, CSV gidiş-dönüş ve mükerrer, C öncesi veritabanı geçişi, yedek/geri yükleme).

## Kod yapısı (sonraki aşamalar için)

| Yol | İçerik |
|---|---|
| `src/lib/actions.ts` | **Eylem katmanı:** `addTransaction`, `createSanalPosition`, `promoteSanalToGercek`, `placeOrder`, `cancelOrder`, `getPortfolioSummary` gibi tüm okuma ve yazma işlemleri. API route'ları bunları kullanır; ileride Claude sohbeti de aynı fonksiyonları araç olarak çağıracak. |
| `src/lib/portfolio.ts` | İşlemler, pozisyon ve K/Z hesabı, sanal giriş ve dönüştürme |
| `src/lib/orders.ts`, `src/lib/orderWatcher.ts` | Emirler, bildirimler, emir izleyici (`src/instrumentation.ts` içinden bir kez başlatılır) |
| `src/lib/prices.ts` | Fiyat servisi (Yahoo + Binance, önbellek, "eski" fiyat desteği) |
| `src/lib/market.ts` | İzleme listesi, sembol arama, grafik verisi (eylemler: `listWatchlist`, `addToWatchlist`, `searchSymbols`, `getPriceChart`) |
| `src/lib/indicators.ts`, `src/lib/signalRules.ts`, `src/lib/technical.ts` | Gösterge motoru (saf, testli), sinyal kuralları, günlük mumlar + analiz + günlük sinyal uyarısı (eylemler: `getTechnicalSignals`, `listTechnicalSignals`) |
| `src/lib/dividends.ts`, `src/lib/dividendLogic.ts` | Temettü geçmişi, öneri, onay; hak ediş mantığı (saf, testli) |
| `src/lib/kap.ts` | KAP sorgusu, saklama, bildirim, yapay zeka bağlamı |
| `src/lib/sourceParse.ts`, `src/lib/http.ts` | TEFAS / altın yanıt ayrıştırma (saf, testli); kibar dış istek ve geri çekilme |
| `src/lib/positionDetail.ts` | Pozisyon detay sayfasının verisi |
| `src/lib/snapshots.ts` | Günlük portföy değeri kayıtları (`getPortfolioHistory`) |
| `src/lib/accounts.ts`, `src/lib/notes.ts` | Hesaplar; pozisyon notu (hedef / stop, alarm hatırlatması) |
| `src/lib/backup.ts`, `src/lib/csv.ts`, `src/lib/importExport.ts` | Yedek / geri yükleme; Excel-TR CSV (saf, testli); dışa / içe aktarma |
| `src/lib/reports.ts`, `src/lib/xirr.ts` | Yıllık gerçekleşen kazanç, sanal gerçeklik kontrolü; XIRR (saf, testli) |
| `src/lib/db.ts` | SQLite bağlantısı ve sürümlü şema geçişleri. Yeni tablo eklemek için `MIGRATIONS` dizisine yeni bir adım ekleyin. |
| `src/lib/auth.ts`, `src/proxy.ts` | İmzalı oturum çerezi ve sayfa/API koruması |
| `src/lib/settings.ts`, `src/lib/aiClient.ts` | Ayarlar, API anahtarı, Claude istemcisi, kullanım/maliyet kaydı ve bütçe, Türkçe hata mesajları |
| `src/lib/chat.ts`, `src/lib/chatTools.ts` | Sohbet döngüsü (akış, araç kullanımı, kayıt) ve eylem katmanını saran araçlar |
| `src/lib/news.ts` | Haber analizi, raporlar, zamanlanmış tarama (emir izleyici döngüsünden çağrılır) |
| `src/lib/push.ts` | Web Push (VAPID, abonelikler, gönderim) |
| `src/components/AppShell.tsx` | Menü. Yeni sayfalar için `NAV` dizisine bir satır eklemeniz yeterli. |
| `public/sw.js` | Service worker; push ve bildirime dokunma işleyicileri dahil. |

Veri modeli yapay zeka analizine uygun tutuldu. Her işlemde `mode` (real/virtual), sanal girişte tutar ve fiyat zamanı, dönüştürme bağlantıları (`source_id`, `converted_to_id`) ve oluşturan emir (`order_id`) bulunur. Emirlerin `source` alanı `manuel` ya da `yapay_zeka` değerini alır.
