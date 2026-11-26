import type { GuideSection } from "./types";

// Kılavuz bölümleri 9–18: alarmlar, bildirimler, Türkiye'ye özel konular, yapay zeka,
// raporlar, yedekleme, eğitim, güvenlik ve sık sorulan sorular.

export const SECTIONS_2: GuideSection[] = [
  {
    id: "alarmlar",
    title: "Alarmlar",
    summary: "İşlem yapmadan yalnızca haber veren hatırlatıcılar.",
    blocks: [
      { type: "p", text: "[[alarm|Alarm]], bir şey olduğunda sana haber veren ama **hiçbir işlem yapmayan** hatırlatıcıdır. Emirden farkı budur: karar her zaman sende kalır." },
      {
        type: "list",
        items: [
          "**Fiyat eşiği:** fiyat bir seviyenin üstüne çıkınca ya da altına inince.",
          "**Günlük % değişim:** bir gün içinde örneğin %5'ten fazla hareket edince.",
          "**Maliyete göre %:** pozisyonun maliyetine göre belli bir yüzde kâra ya da zarara geçince.",
          "**Hacim patlaması:** bugünkü [[hacim]] son 20 günün ortalamasının birkaç katına çıkınca.",
          "**Teknik sinyal değişimi:** sinyal örneğin Nötr'den Al'a dönünce.",
        ],
      },
      {
        type: "steps",
        items: [
          "Alarmlar sayfasında **+ Alarm kur**'a bas (ya da varlık / pozisyon sayfasındaki **Alarm kur**).",
          "Türü ve eşiği seç. İstersen tek bir varlık yerine tüm izleme listen için kur.",
          "**Tek sefer** (bir kez çalar ve kapanır) ya da **her seferinde** (bekleme süresiyle tekrar çalabilir) seç.",
        ],
      },
      { type: "tip", text: "Koşul sürdükçe alarm tekrar tekrar çalmaz; fiyat eşikten uzaklaşıp yeniden gelirse çalar. Böylece telefonun sürekli titremez." },
      { type: "open", links: [{ href: "/alarmlar", label: "Alarmlar" }] },
    ],
  },
  {
    id: "bildirimler",
    title: "Bildirimler",
    summary: "Uygulama içi zil ve telefona/bilgisayara anlık bildirim.",
    blocks: [
      { type: "p", text: "Bildirimler iki yoldan gelir: uygulamanın içindeki **zil** (her zaman açık) ve cihazına gelen **anlık bildirim** (sen açarsan)." },
      { type: "h", text: "Bilgisayarda açmak" },
      {
        type: "steps",
        items: [
          "Uygulamayı Chrome ya da Edge'de aç (istersen önce uygulama olarak kur).",
          "Ayarlar › **Bildirimler** kartında **Bildirimleri aç**'a bas.",
          "Tarayıcı izin sorunca **İzin ver** de.",
          "**Deneme bildirimi gönder** ile çalıştığını kontrol et.",
        ],
      },
      { type: "h", text: "Telefonda açmak" },
      {
        type: "steps",
        items: [
          "Uygulamayı telefonda **https://** ile başlayan adresten aç (yerel modda bu, kurulumdaki Tailscale adresidir).",
          "**iPhone:** önce Paylaş → **Ana Ekrana Ekle** ile kur, sonra ana ekrandaki simgeden aç. **Android:** doğrudan devam edebilirsin.",
          "Ayarlar › **Bildirimler** › **Bildirimleri aç** ve izin ver.",
        ],
      },
      { type: "warn", text: "Anlık bildirimler yalnızca güvenli (https) bağlantıda çalışır. \"Yalnızca HTTPS bağlantıda çalışır\" uyarısı görürsen adresin http:// ile başlıyordur." },
      { type: "p", text: "Neler bildirilir: emir gerçekleşti / başarısız, alarm çaldı, önemli haber (önem 4–5), teknik sinyal değişti, pozisyondaki hisse için KAP duyurusu ve günlük özet. Bazılarını Ayarlar'dan kapatabilirsin." },
      { type: "open", links: [{ href: "/ayarlar#bildirimler", label: "Ayarlar › Bildirimler" }] },
    ],
  },
  {
    id: "turkiye",
    title: "Türkiye'ye özel: TEFAS, altın, temettü, KAP",
    summary: "Yatırım fonları, altın türleri ve makas, temettü ve stopaj, KAP duyuruları.",
    blocks: [
      { type: "h", text: "TEFAS yatırım fonları" },
      {
        type: "p",
        text: "[[fon|Yatırım fonları]] TEFAS'ta işlem görür ve 3 harfli bir kodla bilinir (örneğin AFT). İşlem eklerken ya da ararken bu kodu yaz; uygulama kodu TEFAS'ta doğrular. Fon fiyatları **günde bir kez** açıklanır, bu yüzden gün içinde değişmez ve \"Bugün\" son açıklanan günün değişimini gösterir.",
      },
      { type: "h", text: "Altın türleri ve makas" },
      {
        type: "p",
        text: "Uygulama [[gram-altin|gram altın]], çeyrek, yarım, tam, cumhuriyet, ata ve 22 ayar bilezik (gram) destekler. Kuyumcu sana altını **satış** fiyatından satar, senden **alış** fiyatından alır; aradaki farka [[makas]] denir.",
      },
      { type: "figure", figure: "makas", caption: "Alırken üstteki (satış) fiyatı ödersin; elindeki altın alttaki (alış) fiyatla değerlenir. Aradaki fark yüzünden alır almaz küçük bir zarar görünür." },
      { type: "tip", text: "Altın aldığın gün eksi görmen normaldir: bu makastır, kötü bir alım yaptığın anlamına gelmez." },
      { type: "h", text: "Temettü ve stopaj" },
      {
        type: "steps",
        items: [
          "Elindeki hisse [[temettu|temettü]] dağıttığında, [[hak-kullanim|hak kullanım gününden]] önce elinde olduğu için Temettü sayfasında ve Portföy'de bir **öneri** belirir.",
          "Bankana yatan tutarı kontrol et ve **Onayla**'ya bas. Tutar, [[stopaj]] düşülmüş net olarak gerçekleşen K/Z'ye eklenir.",
          "Yatan tutar farklıysa **Düzenle** ile düzelt. Stopaj oranlarını Ayarlar'dan değiştirebilirsin.",
        ],
      },
      { type: "warn", text: "Vergi ve stopaj oranları değişebilir. Uygulamadaki oranlar bilgilendirme amaçlıdır; güncel kuralları resmî kaynaklardan ya da bir mali müşavirden teyit et." },
      { type: "h", text: "KAP" },
      {
        type: "p",
        text: "[[kap|KAP]], şirketlerin resmî duyurularını yayımladığı yerdir. Uygulama hafta içi gün boyunca KAP'ı düzenli kontrol eder ve portföyündeki ya da izleme listendeki BIST hisseleriyle ilgili duyuruları KAP sayfasında ve varlık sayfasında gösterir. Pozisyonundaki hisseler için bildirim de gelebilir (Ayarlar'dan ayarlanır).",
      },
      { type: "open", links: [{ href: "/temettu", label: "Temettü" }, { href: "/kap", label: "KAP" }, { href: "/ayarlar", label: "Ayarlar (stopaj, KAP bildirimi)" }] },
    ],
  },
  {
    id: "hesaplayicilar",
    title: "Hesaplayıcılar",
    summary: "Mevduat, birikim planı, ortalama maliyet, reel getiri ve döviz/altın çevirici.",
    blocks: [
      { type: "p", text: "Hesaplayıcılar \"ne olurdu?\" sorularını hızlıca cevaplar. Hiçbiri kayıt oluşturmaz; istediğin kadar deneyebilirsin." },
      {
        type: "list",
        items: [
          "**Mevduat getirisi:** bankaya yatırsan stopaj sonrası net ne kazanırdın ([[mevduat]]).",
          "**Birikim planı:** her ay düzenli para ekleyince [[bilesik-getiri|bileşik getiri]] ile yıllar içinde ne birikir.",
          "**Ortalama maliyet:** farklı fiyatlardan alışların [[ortalama-maliyet|ortalaması]] ve başabaş fiyatı.",
          "**Reel getiri:** kazancın [[enflasyon]] düşüldükten sonra gerçekte ne ettiği ([[reel-getiri]]).",
          "**Döviz / altın çevirici:** canlı kurlarla TL, dolar, euro, sterlin ve gram altın arasında çeviri.",
        ],
      },
      { type: "open", links: [{ href: "/hesaplayicilar", label: "Hesaplayıcılar" }] },
    ],
  },
  {
    id: "yapay-zeka",
    title: "Yapay zeka",
    summary: "Anahtar eklemek, maliyet ve bütçe, sohbet, haber analizi, günlük özet ve kaynaklar.",
    blocks: [
      {
        type: "p",
        text: "Uygulamanın bazı bölümleri Claude yapay zekasını kullanır: Sohbet, Analizler (haber taraması) ve varlık sayfasındaki bazı özetler. Bunlar isteğe bağlıdır; anahtar eklemezsen uygulamanın geri kalanı aynen çalışır.",
      },
      { type: "h", text: "Anahtar eklemek" },
      {
        type: "steps",
        items: [
          "console.anthropic.com adresinde hesap aç, **Billing** bölümünden küçük bir kredi yükle.",
          "**API Keys** bölümünden yeni bir anahtar oluştur ve kopyala.",
          "Uygulamada Ayarlar › **Yapay zeka anahtarı** kartına yapıştır ve kaydet.",
          "**Bağlantıyı test et** ile çalıştığını kontrol et.",
        ],
      },
      { type: "warn", text: "[[api-anahtari|API anahtarı]] bir şifre gibidir; kimseyle paylaşma. Uygulama onu maskeli gösterir ve istersen silebilirsin." },
      { type: "h", text: "Maliyet ve bütçe" },
      {
        type: "p",
        text: "Her yapay zeka isteği küçük bir ücret tutar; **Ekonomik** model çok ucuzdur, **Gelişmiş** model yaklaşık 20 kat pahalıdır. Maliyetin çoğu web aramasından gelir; bu yüzden uygulama önce ücretsiz haber başlıklarını ve KAP'ı kullanır. Ayarlar'da **aylık bütçe** belirlersin (varsayılan 10 $); bütçe dolunca otomatik taramalar durur, sohbet uyarıyla çalışmaya devam eder. \"Bu ay tahmini harcama\" Ayarlar'da ve Analizler'de görünür.",
      },
      { type: "h", text: "Sohbet" },
      {
        type: "list",
        items: [
          "Portföyün, fiyatlar, emirler, temettüler, KAP ve son haber raporu hakkında soru sorabilirsin: \"Bu ay en çok hangi pozisyonum düştü?\"",
          "Açıkça istersen işlem de yapar: sanal pozisyon açmak, işlem eklemek, emir vermek ya da iptal etmek, alarm kurmak. Her işlem sohbette rakamlarıyla bir kart olarak görünür.",
          "Belirsiz bir talimatta (hangi pozisyon, ne kadar) önce sorar. Geçmiş sohbetlere **Geçmiş** düğmesinden ulaşırsın.",
        ],
      },
      { type: "warn", text: "Sohbette açıkça istediğin işlemler onay sorulmadan kaydedilir. Ne yazdığından emin ol; yanlış bir kayıt olursa İşlemler ya da Emirler sayfasından silebilirsin." },
      { type: "h", text: "Haber analizi, günlük özet, \"Neden hareket ediyor?\"" },
      {
        type: "list",
        items: [
          "**Analizler:** portföyündeki ve izleme listendeki varlıklar için haberleri tarar; her biri için olumlu/olumsuz/nötr, önem (1–5), kısa özet ve kaynak bağlantıları verir. Hafta içi belirli saatlerde kendiliğinden ya da **Şimdi analiz et** ile çalışır.",
          "**Günlük özet:** hafta içi akşam, web araması yapmadan kısa bir gün özeti hazırlanır ve Portföy'ün üstünde görünür.",
          "**Neden hareket ediyor?:** varlık sayfasında, günlük hareketi büyük olan varlıklar için ilgili haber başlıklarını ve KAP duyurularını özetler.",
        ],
      },
      { type: "h", text: "Rakamlar neden araçlardan gelir?" },
      {
        type: "p",
        text: "Yapay zeka bazen emin olmadan rakam uydurabilir. Bu yüzden fiyatlar, K/Z ve portföy rakamları her zaman uygulamanın kendi hesaplarından (araçlardan) alınır. Yanıtta bu kaynaklarda olmayan bir rakam geçerse \"doğrulanamayan rakam\" olarak işaretlenir. Haber analizlerinde kaynak bağlantılarına tıklayıp aslını okuyabilirsin.",
      },
      { type: "tip", text: "Yapay zekanın söylediklerini bir arkadaşın yorumu gibi düşün: faydalı olabilir ama yatırım tavsiyesi değildir ve yanılabilir." },
      { type: "open", links: [{ href: "/ayarlar#anahtar", label: "Ayarlar › Yapay zeka anahtarı" }, { href: "/sohbet", label: "Sohbet" }, { href: "/analizler", label: "Analizler" }] },
    ],
  },
  {
    id: "raporlar",
    title: "Raporlar, CSV ve yıllık rapor",
    summary: "Excel'e aktarmak, başka kurumdan işlem almak ve yıllık gerçekleşen kazanç raporu.",
    blocks: [
      { type: "h", text: "Excel'e aktar (CSV)" },
      {
        type: "p",
        text: "Rapor & veri sayfasından işlemlerini, pozisyonlarını, temettülerini ve gerçekleşen kazancını Excel'in Türkçe ayarlarıyla açılan CSV dosyası olarak indirebilirsin (ondalık virgül, gün.ay.yıl tarih).",
      },
      { type: "h", text: "İşlemleri içe aktarmak" },
      {
        type: "steps",
        items: [
          "**Şablonu indir** ve işlemlerini bu biçimde doldur ya da aracı kurumundan aldığın dosyayı kullan.",
          "Dosyayı seç. Sütun adları farklıysa her sütunun neye karşılık geldiğini (tarih, sembol, yön, miktar, fiyat…) eşleştir.",
          "Önizlemede hatalı satırlar tek tek gösterilir. Aynı işlem zaten kayıtlıysa \"mükerrer\" olarak işaretlenir ve tekrar eklenmez.",
          "Her şey doğruysa içe aktar. İşlem ya tamamen yapılır ya hiç yapılmaz; yarım kalmaz.",
        ],
      },
      { type: "h", text: "Yıllık gerçekleşen kazanç raporu" },
      {
        type: "p",
        text: "Her yıl için, varlık varlık [[gerceklesen-kz|gerçekleşen K/Z]] (işlem günü kurlarıyla), temettü brüt / stopaj / net ve ödenen komisyonu gösterir. Vergi beyanına hazırlanırken işine yarar ama **resmî bir vergi beyanı değildir**.",
      },
      { type: "open", links: [{ href: "/rapor", label: "Rapor & veri" }] },
    ],
  },
  {
    id: "yedekleme",
    title: "Yedekleme ve geri yükleme",
    summary: "Verilerini kaybetmemek için yedek almak ve yedekten dönmek.",
    blocks: [
      { type: "p", text: "Yedek, verilerinin bir fotokopisidir. Bir şeyler ters giderse (bilgisayar bozulur, yanlışlıkla silersin) fotokopiden geri dönersin." },
      { type: "h", text: "Yerel modda" },
      {
        type: "list",
        items: [
          "Uygulama çalışırken **her gün otomatik** yedek alır ve son 14 yedeği saklar. Şema güncellemesinden önce de yedek alınır.",
          "Ayarlar › **Yedekleme ve geri yükleme** › **Şimdi yedekle** ile elle yedek alabilir, listeden bir yedeği **indirebilirsin**.",
          "**Yedekten geri yükle:** bir yedek seç ya da dosya yükle. Dosya kontrol edilir, iki kez onay istenir ve önce mevcut verinin yedeği alınır.",
        ],
      },
      { type: "h", text: "Bulut modunda" },
      {
        type: "list",
        items: [
          "Veriler bulut veritabanında durur. Ayarlar'daki **Tüm verilerimi indir (JSON)** ile ara sıra bir kopyasını bilgisayarına al.",
          "**JSON'dan geri yükle:** daha önce indirdiğin dosyayı seç. Önce mevcut verilerin indirilir, sonra seçtiğin dosya yerine yazılır.",
          "Gizli anahtarlar (yapay zeka, bildirim) sen istemedikçe dosyaya girmez.",
        ],
      },
      { type: "tip", text: "Ayda bir, bir yedeği USB belleğe ya da kendi bulut klasörüne kopyalamak iyi bir alışkanlıktır. Yedek dosyası tüm işlemlerini içerir; kimseyle paylaşma." },
      { type: "open", links: [{ href: "/ayarlar#yedek", label: "Ayarlar › Yedekleme" }] },
    ],
  },
  {
    id: "egitim",
    title: "Öğretici Analiz Desteği (Eğitim)",
    summary: "Kısa derslerle grafik okumayı ve yatırımın temellerini öğrenmek.",
    blocks: [
      {
        type: "p",
        text: "Eğitim sayfasında, her biri birkaç dakika süren kısa dersler vardır: mum grafiği, trend, destek/direnç, RSI, MACD… Ayrıca **Temel Bilgiler** bölümünde ücretler ve komisyon, vergi temelleri, çeşitlendirme ve duygular; kripto paralar, BIST ve ABD hisseleri, ETF'ler, endeksler, emtia, döviz, altın ve yatırım fonları için de ayrı bölümlerde dersler bulunur.",
      },
      {
        type: "list",
        items: [
          "Her ders: \"Nedir?\", örnek bir grafik ya da çizim, adım adım yorum, sık yapılan hatalar ve 3 soruluk bir test.",
          "Testi bitirince ders tamamlandı olarak işaretlenir. İlerlemen yalnızca bu cihazda saklanır.",
          "\"Uygulamada dene\" bağlantıları öğrendiğini hemen sanal portföyde ya da grafiklerde denemeni sağlar.",
        ],
      },
      { type: "tip", text: "Acele etme ve sıra yok: istediğin dersi istediğin zaman aç. Dersler örnek veriyle anlatılır; gerçek bir varlığı tavsiye etmez." },
      { type: "open", links: [{ href: "/egitim", label: "Eğitim" }, { href: "/egitim/mum-grafigi", label: "1. ders: Mum grafiği" }] },
    ],
  },
  {
    id: "guvenlik",
    title: "Güvenlik ve gizlilik",
    summary: "Verilerin nerede durur, kim görebilir, nelere dikkat etmelisin.",
    blocks: [
      {
        type: "list",
        items: [
          "Uygulama **tek kullanıcılıdır**: senin şifrenle korunur ve başka hesap yoktur.",
          "Yerel modda verilerin yalnızca kendi bilgisayarındadır. Bulut modunda senin açtığın bulut veritabanındadır.",
          "Uygulama bankana ya da aracı kurumuna bağlanmaz, banka şifresi istemez ve para gönderemez.",
          "Yapay zeka kullanıyorsan sorduğun sorular ve gerekli portföy bilgileri yanıt üretmek için Claude'a gönderilir. Anahtar eklemezsen hiçbir şey gönderilmez.",
          "Fiyat ve haberler için Yahoo Finance, Binance, TEFAS, KAP ve haber kaynakları gibi dış servislere sorgu gider; bunlara portföy bilgin gönderilmez.",
        ],
      },
      { type: "warn", text: "Şifreni, API anahtarını ve yedek dosyalarını kimseyle paylaşma. Bulut modunda uzun, tahmin edilemez bir şifre kullan; uygulama internete açıktır." },
      { type: "tip", text: "Ortak kullanılan bir bilgisayarda işin bitince **Çıkış**'a bas." },
    ],
  },
  {
    id: "sss",
    title: "Sık sorulan sorular ve sorun giderme",
    summary: "Eski fiyatlar, BIST gecikmesi, kontrollerin durması, Son nöbet uyarısı, unutulan şifre.",
    blocks: [
      {
        type: "faq",
        items: [
          {
            q: "Fiyatın yanında sarı \"eski\" yazıyor. Ne demek?",
            a: "Fiyat kaynağına o an ulaşılamadı; uygulama son bilinen fiyatı ve saatini gösteriyor. Genelde birkaç dakika içinde düzelir. **Yenile** düğmesini deneyebilirsin. Uzun sürerse internet bağlantını kontrol et.",
          },
          {
            q: "BIST fiyatları aracı kurumumdakinden farklı.",
            a: "Ücretsiz kaynaktaki Borsa İstanbul fiyatları yaklaşık **15 dakika gecikmelidir** ([[gecikmeli-fiyat]]). Anlık fiyat için aracı kurumuna bak. Altında kuyumcu fiyatları, fonlarda ise günde bir açıklanan fiyat kullanılır.",
          },
          {
            q: "Emirlerim ve alarmlarım çalışmadı (kontroller duruyor).",
            a: "Yerel modda kontrolleri yapan bekçi (arka plan motoru) yalnızca **uygulama bilgisayarda açıkken** çalışır. Bilgisayar kapalıysa ya da uyku modundaysa o arada emir gerçekleşmez, alarm çalmaz; açılınca kontrol kaldığı yerden devam eder. Uygulamayı yeniden başlatmak çoğu zaman yeterlidir.",
          },
          {
            q: "Ayarlar'da \"Son nöbet\" sarı görünüyor.",
            a: "Son otomatik kontrol beklenenden eski demektir. Yerel modda uygulamayı yeniden başlat. Bulut modunda dışarıdaki çalar saatin (cron-job.org görevinin) açık olduğunu ve şifresinin (CRON_SECRET) doğru girildiğini kontrol et; ayrıntılar BULUT.md dosyasında.",
          },
          {
            q: "Şifremi unuttum.",
            a: "Şifre, uygulamanın ayar dosyasındaki **APP_PASSWORD** satırında yazar. Yerel modda proje klasöründeki .env dosyasını not defteriyle açıp bu satırı yeni şifrenle değiştir ve uygulamayı yeniden başlat. Bulut modunda Vercel'de Settings › Environment Variables'tan APP_PASSWORD'ü düzenle ve yeniden yayınla (Redeploy).",
          },
          {
            q: "Altın aldım, hemen zararda görünüyor.",
            a: "Bu [[makas]] yüzündendir: alırken kuyumcunun satış fiyatını ödersin, elindeki altın ise alış fiyatıyla değerlenir.",
          },
          {
            q: "Değer geçmişi grafiğinde bazı günler yok.",
            a: "Günlük değer, uygulama çalışırken kaydedilir. Yerel modda bilgisayarın kapalı olduğu günler için kayıt oluşmaz.",
          },
          {
            q: "Yapay zeka \"anahtar eklenmedi\" diyor.",
            a: "Ayarlar › Yapay zeka anahtarı kartına anahtarını ekle (Yapay zeka bölümüne bak). Anahtar varsa ama yine çalışmıyorsa **Bağlantıyı test et** ile hata mesajını gör; çoğu zaman kredi bitmiştir.",
          },
          {
            q: "Bildirim gelmiyor.",
            a: "Ayarlar › Bildirimler'de \"Bu cihazda açık\" yazdığını kontrol et ve **Deneme bildirimi gönder**'e bas. Telefonda adresin https ile başlamalı; iPhone'da uygulamayı ana ekrandan açmalısın. Telefonun bildirim ayarlarında da izin verilmiş olmalı.",
          },
          {
            q: "Uygulama bana ne almam gerektiğini söyler mi?",
            a: "Hayır. Uygulama kayıt tutar, hesaplar, özetler ve öğretir; yatırım tavsiyesi vermez. Sinyaller ve yapay zeka yorumları yalnızca bilgi amaçlıdır.",
          },
        ],
      },
      { type: "h", text: "İlk adımlar kartı" },
      { type: "p", text: "Portföy sayfasındaki \"İlk adımlar\" kartını kapattıysan buradan yeniden açabilirsin." },
      { type: "checklist" },
      { type: "open", links: [{ href: "/ayarlar#nobet", label: "Ayarlar › Nöbet" }, { href: "/sozluk", label: "Sözlük" }] },
    ],
  },
];
