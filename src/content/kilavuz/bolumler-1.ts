import type { GuideSection } from "./types";

// Kılavuz bölümleri 1–9: başlangıç, ekran, portföyler, piyasa, grafikler, emirler.

export const SECTIONS_1: GuideSection[] = [
  {
    id: "baslarken",
    title: "Başlarken",
    summary: "Uygulama nedir, nasıl giriş yapılır, telefona ve bilgisayara nasıl kurulur.",
    blocks: [
      {
        type: "p",
        text: "Bu uygulama kişisel bir **yatırım defteri**dir. Gerçekte aldığın ve sattığın hisse, fon, altın, döviz ve kriptoları buraya yazarsın; uygulama canlı fiyatlarla bugün ne kadar ettiklerini, ne kadar kazandığını ya da kaybettiğini hesaplar. Ayrıca para harcamadan deneme yapabileceğin bir [[sanal-portfoy|sanal portföy]] vardır.",
      },
      {
        type: "p",
        text: "Önemli olan şu: uygulama hiçbir bankaya ya da [[araci-kurum|aracı kuruma]] bağlı değildir. Buradan gerçek para hareket etmez; yalnızca kayıt tutar, hesaplar ve hatırlatır. Bunu mutfaktaki not defteri gibi düşün: alışverişi markette yaparsın, deftere ise ne aldığını yazarsın.",
      },
      { type: "h", text: "Giriş ve şifre" },
      {
        type: "steps",
        items: [
          "Uygulamayı açınca giriş ekranı gelir. Kurulumda belirlenen şifreyi yaz ve **Giriş**'e bas.",
          "Şifreyi birkaç kez yanlış yazarsan her denemeden sonra biraz beklemen gerekir; bu, başkalarının şifreni tahmin etmesini zorlaştırır.",
          "İşin bitince sağ üstteki **Çıkış** ile oturumu kapatabilirsin. Kendi cihazında açık bırakman sorun değildir.",
        ],
      },
      { type: "tip", text: "Şifreni unuttuysan aşağıdaki \"Sık sorulan sorular\" bölümüne bak: şifre, uygulamanın ayar dosyasında (APP_PASSWORD) yazar ve oradan değiştirilir." },
      { type: "h", text: "Uygulama olarak kurmak (ana ekrana eklemek)" },
      {
        type: "list",
        items: [
          "**iPhone (Safari):** alttaki Paylaş düğmesi → **Ana Ekrana Ekle**.",
          "**Android (Chrome):** sağ üstteki ⋮ menüsü → **Uygulamayı yükle** (ya da **Ana ekrana ekle**).",
          "**Bilgisayar (Chrome / Edge):** adres çubuğunun sağındaki **Yükle** simgesi.",
        ],
      },
      { type: "p", text: "Kurduktan sonra uygulama kendi simgesiyle, tarayıcı çubukları olmadan tam ekran açılır. Telefona anlık bildirim almak için de (özellikle iPhone'da) önce ana ekrana eklemek gerekir." },
      { type: "h", text: "Yerel mod ve bulut modu" },
      {
        type: "figure",
        figure: "yerel-bulut",
        caption: "Yerel modda her şey senin bilgisayarında, bulut modunda internetteki bir sunucuda çalışır. Kullanım ikisinde de aynıdır.",
      },
      {
        type: "list",
        items: [
          "**Yerel mod** (varsayılan): uygulama bilgisayarında çalışır, veriler bilgisayarındaki tek bir dosyadadır. Bir dükkân gibi düşün: dükkân (bilgisayar) açıkken bekçi her 30 saniyede bir emirlerini ve alarmlarını kontrol eder. Bilgisayar kapalıysa kontrol de durur.",
          "**Bulut modu** (isteğe bağlı): uygulama internetteki bir sunucuda çalışır; bilgisayarın kapalıyken de telefondan girebilirsin. Bekçiyi dışarıdan bir \"çalar saat\" uyandırır: hafta içi gün içinde dakikada bir, diğer zamanlarda daha seyrek.",
        ],
      },
      { type: "tip", text: "Hangi modda olduğunu Ayarlar sayfasındaki **Nöbet (otomatik kontroller)** kartı söyler." },
      { type: "open", links: [{ href: "/ayarlar#nobet", label: "Ayarlar › Nöbet" }] },
    ],
  },
  {
    id: "ekran",
    title: "Ekranı tanı",
    summary: "Menü, zil, ayarlar ve telefondaki alt çubuk.",
    blocks: [
      { type: "figure", figure: "ekran", caption: "Üstte logo, zil (bildirimler) ve dişli (Ayarlar); telefonda altta ana sayfalar ve \"Daha fazla\" menüsü." },
      {
        type: "list",
        items: [
          "**Menü:** bilgisayarda üstte, telefonda altta durur. Telefonda Portföy, Piyasa, Emirler ve Sohbet doğrudan görünür; diğer sayfalar (Sinyaller, Eğitim, Alarmlar, Temettü, KAP, İşlemler, Rapor, Hesaplayıcılar, Analizler, Kılavuz, Sözlük) **Daha fazla** düğmesindedir.",
          "**Zil:** emir gerçekleşince, alarm çalınca, önemli bir haber ya da KAP duyurusu gelince burada bir bildirim belirir. Okunmamışların sayısı zilin üstünde yazar.",
          "**Dişli (Ayarlar):** hesaplar, yedekleme, yapay zeka anahtarı, bildirimler ve diğer tercihler.",
          "**\"?\" işaretleri:** bir terimin yanında küçük bir soru işareti görürsen dokun; tek cümlelik açıklama ve sözlüğe bağlantı açılır.",
        ],
      },
      {
        type: "p",
        text: "Fiyatların yanında küçük gri yazılar görürsün: fiyatın kaynağı ve saati. **gecikmeli (15 dk)** etiketi BIST fiyatlarının biraz geriden geldiğini, sarı **eski** etiketi ise kaynağa o an ulaşılamadığını ve son bilinen fiyatın gösterildiğini anlatır.",
      },
      { type: "open", links: [{ href: "/", label: "Portföy" }, { href: "/ayarlar", label: "Ayarlar" }, { href: "/sozluk", label: "Sözlük" }] },
    ],
  },
  {
    id: "gercek-portfoy",
    title: "Gerçek portföy",
    summary: "Alış ve satış eklemek, hesaplar, komisyon, Bugün, kur etkisi, grafikler ve yıllık getiri.",
    blocks: [
      { type: "p", text: "Ana sayfadaki **Gerçek** sekmesi, gerçekte yaptığın alım satımların kaydıdır. Uygulama her pozisyon için [[ortalama-maliyet|ortalama maliyeti]], bugünkü değeri ve kâr/zararı hesaplar." },
      { type: "h", text: "Alış ya da satış eklemek" },
      {
        type: "steps",
        items: [
          "Portföy sayfasında **+ İşlem ekle**'ye bas.",
          "Varlık türünü seç (hisse, fon, altın, döviz, kripto) ve sembolü ara: \"THYAO\", \"altın\", \"dolar\" ya da 3 harfli fon kodu yazabilirsin.",
          "**Alış** ya da **Satış**'ı seç, miktarı ve birim fiyatı gir. Ondalık için virgül, binlik için nokta kullan: 12,5 ve 10.000.",
          "Tarihi kontrol et. Geçmiş bir işlemi giriyorsan o günün tarihini seç; dövizli varlıklarda o günün kuru kendiliğinden kullanılır.",
          "İstersen komisyonu ve bir not ekle, sonra **Kaydet**.",
        ],
      },
      { type: "warn", text: "Elinde olandan fazlasını satamazsın; uygulama bunu engeller. Önce alışları, sonra satışları gir." },
      { type: "h", text: "Hesaplar" },
      {
        type: "p",
        text: "Birden fazla yerde yatırımın varsa (örneğin bir banka, bir yatırım uygulaması ve evdeki altın kasası) her biri için ayrı bir **hesap** açabilirsin. Ayarlar › **Hesaplar**'dan ekle, adını değiştir ve varsayılan komisyon oranını yaz. Portföy'deki hesap çipleriyle tek bir hesaba bakabilir, **Toplama dahil** anahtarıyla bir hesabı toplamın dışında bırakabilirsin.",
      },
      { type: "h", text: "Komisyon" },
      {
        type: "p",
        text: "[[komisyon|Komisyon]], aracı kurumun her işlemde aldığı ücrettir. İşlem formunda tutar ya da yüzde olarak girersin; boş bırakırsan hesabın oranı kullanılır. Alışta maliyete eklenir, satışta eline geçenden düşülür. Böylece gördüğün kâr gerçekten cebine girecek olana yakın olur.",
      },
      { type: "h", text: "Özet kartını okumak" },
      { type: "figure", figure: "portfoy-ozet", caption: "Toplam değer, toplam K/Z, yıllık getiri ve Bugün; altında maliyet, gerçekleşmemiş ve gerçekleşen K/Z." },
      {
        type: "list",
        items: [
          "**Toplam değer:** elindeki her şeyin bugünkü TL karşılığı.",
          "**[[gerceklesmemis-kz|Gerçekleşmemiş K/Z]]:** henüz satmadıklarının kağıt üzerindeki kârı ya da zararı.",
          "**[[gerceklesen-kz|Gerçekleşen K/Z]]:** sattıklarının kesinleşmiş sonucu (onaylanan temettüler dahil).",
          "**[[bugun|Bugün]]:** bugün, dünkü kapanışa göre ne kadar değiştiğin. Hafta sonu son seansın değişimi gösterilir.",
          "**[[xirr|Yıllık getiri]]:** paranın ne zaman girdiğini hesaba katan, banka faiziyle kıyaslanabilir yüzde. En az 30 günlük geçmiş gerekir.",
        ],
      },
      { type: "h", text: "Kur etkisi" },
      {
        type: "p",
        text: "Dolar ya da euro cinsinden varlıklarda (örneğin bir ABD hissesi) TL kârın iki parçadır: varlığın kendi fiyatının değişimi (**fiyat etkisi**) ve aldığın günden bugüne kurun değişimi (**[[kur-etkisi|kur etkisi]]**). Hisse hiç kıpırdamasa bile dolar yükseldiyse TL olarak kazanmış görünürsün; liste bunu ayrı ayrı gösterir.",
      },
      { type: "h", text: "Grafikler ve kartlar" },
      {
        type: "list",
        items: [
          "**Varlık dağılımı:** paranın türlere ve varlıklara nasıl bölündüğünü gösteren halka.",
          "**Değer geçmişi:** portföyünün günlük toplam değeri. Uygulama açık kaldıkça her gün bir kayıt eklenir.",
          "**Portföyüm vs BIST 100 / Dolar / Gram altın:** kendi getirini basit alternatiflerle kıyaslar ([[benchmark]]).",
          "**Risk kartı:** paranın birkaç varlıkta ne kadar toplandığını gösteren [[risk-puani|yoğunlaşma puanı]] ve istersen hedef dağılımına göre [[dengeleme]] önerisi.",
          "**Günlük özet:** hafta içi akşam hazırlanan kısa bir \"bugün ne oldu\" yazısı.",
        ],
      },
      { type: "tip", text: "Bir pozisyona dokunursan o varlığın ayrıntılı sayfası açılır (bir sonraki bölüm)." },
      { type: "open", links: [{ href: "/", label: "Portföy" }, { href: "/ayarlar#hesaplar", label: "Ayarlar › Hesaplar" }, { href: "/islemler", label: "İşlemler listesi" }] },
    ],
  },
  {
    id: "pozisyon-detay",
    title: "Yatırım detay sayfası",
    summary: "Alış/satış işaretleri, maliyet çizgisi, not/hedef/stop ve \"Şimdi satarsam\".",
    blocks: [
      { type: "p", text: "Portföy'de bir satıra dokununca o pozisyonun kendi sayfası açılır. Burada tek bir yatırımın tüm hikâyesi vardır." },
      { type: "figure", figure: "pozisyon-grafik", caption: "Yeşil oklar alışların, kırmızı oklar satışların; kesikli yatay çizgi ortalama maliyetin. Fiyat çizginin üstündeyse kârdasın." },
      {
        type: "list",
        items: [
          "**Fiyat ve işlemlerin:** fiyat grafiğinde her alış ve satışın bir işaretle gösterilir. \"Maliyetin\" çizgisinin üstü yeşil (kâr), altı kırmızı (zarar) bölgedir.",
          "**Yatırımımın değeri:** bu pozisyona yatırdığın paranın zaman içindeki değeri.",
          "**Hesaplara göre:** aynı varlık birkaç hesapta varsa kırılımı görürsün.",
          "**Teknik analiz, bekleyen emirler, temettü, KAP ve son haber analizi:** bu varlıkla ilgili her şey tek sayfada.",
        ],
      },
      { type: "h", text: "Not, hedef ve stop" },
      {
        type: "steps",
        items: [
          "**Pozisyon notu** kartında \"Neden aldım?\" ve \"Ne olursa satarım?\" sorularını kısaca yanıtla.",
          "İstersen bir [[hedef-stop|hedef fiyat]] (kâr alma) ve bir [[stop-loss|stop fiyatı]] (zarar kesme) yaz. Grafikte kesikli çizgiler olarak görünürler.",
          "**Hedef/stop için alarm kur** düğmesiyle fiyat bu seviyelere gelince bildirim al. Stop alarmı çalınca bildirimde satış planın hatırlatılır.",
        ],
      },
      { type: "tip", text: "Not yazmak küçük ama güçlü bir alışkanlıktır: fiyat sert düştüğünde, aldığın günkü sakin düşünceni okumak panikle satmayı önler." },
      { type: "h", text: "Şimdi satarsam" },
      {
        type: "p",
        text: "Bu kutu, pozisyonu bugün satsan komisyon düştükten sonra eline yaklaşık ne geçeceğini ve varlık türüne göre [[stopaj]] notunu gösterir. Tahmindir; vergi ya da yatırım tavsiyesi değildir.",
      },
      { type: "p", text: "Sayfanın altındaki düğmelerle bu varlıktan yeniden **Al**, **Sat** ya da **Emir ver** diyebilirsin. Sanal pozisyonda bu düğmeler **Gerçekten aldım** ve **Sanal sat / kapat** olur." },
      { type: "open", links: [{ href: "/", label: "Portföy (bir pozisyona dokun)" }] },
    ],
  },
  {
    id: "sanal-portfoy",
    title: "Sanal portföy",
    summary: "Para harcamadan denemek, \"Gerçekten aldım\" ve gerçeklik kartı.",
    blocks: [
      {
        type: "p",
        text: "Sanal portföy, \"şunu alsaydım ne olurdu?\" sorusunun cevabıdır (İngilizcede *paper trading*). Canlı fiyatlarla hayali alım yaparsın; gerçek portföyünle **asla karışmaz**. Yatırıma yeni başlıyorsan en iyi başlangıç noktasıdır: hata yapmak bedava.",
      },
      {
        type: "steps",
        items: [
          "Portföy sayfasında üstteki **Sanal** sekmesine geç.",
          "**+ Sanal pozisyon**'a bas, varlığı seç.",
          "Bir **tutar** (örneğin 10.000 TL) ya da **adet** gir. Uygulama o anki fiyatı alır ve kaç adet alabileceğini hesaplar.",
          "Kaydet. Artık her gün bu \"hayali\" yatırımın ne durumda olduğunu görebilirsin.",
        ],
      },
      { type: "h", text: "\"Gerçekten aldım\"" },
      { type: "figure", figure: "sanal-gercek", caption: "Sanal pozisyonu gerçeğe taşıyınca sanal kayıt silinmez; arşivlenip gerçek işleme bağlanır." },
      {
        type: "p",
        text: "Sanal denediğin bir varlığı sonra gerçekten aldıysan, pozisyonun yanındaki **Gerçekten aldım** düğmesine bas. Form sanal bilgilerle dolar; gerçekte ödediğin fiyatı ve aldığın miktarı düzeltip kaydedersin. Pozisyon gerçek portföye geçer, böylece ileride \"planladığım ile gerçekleşen\" karşılaştırılabilir.",
      },
      { type: "h", text: "Gerçeklik kartı" },
      {
        type: "p",
        text: "Sanal sekmesindeki **gerçeklik kontrolü** kartı, sanal işlemlerinin dürüst bir özetini verir: kaç işlem yaptın, kaçı kazandı, kaçı kaybetti, en iyi ve en kötü sonuç, en büyük düşüş ve gerçekte ödemen gerekecek tahmini [[komisyon]].",
      },
      { type: "warn", text: "Sanal sonuçlar gerçekten genelde daha iyi görünür: sanalda komisyon ve makas ödemezsin, en önemlisi gerçek para kaybetmenin yarattığı korkuyu yaşamazsın. Eğitim'deki \"Duygular ve aşırı işlem\" dersi bunu anlatır." },
      { type: "open", links: [{ href: "/?mod=sanal", label: "Sanal portföyü aç" }, { href: "/egitim/duygular-ve-asiri-islem", label: "Ders: Duygular ve aşırı işlem" }] },
    ],
  },
  {
    id: "piyasa",
    title: "Piyasa ve izleme listesi",
    summary: "Genel bakış, piyasa listeleri (kripto, BIST, ABD, ETF, endeks, emtia…), izleme listesi ve varlık sayfası.",
    blocks: [
      {
        type: "p",
        text: "Piyasa sayfası, piyasanın bugünkü \"hava durumu\"dur: [[bist-100|BIST 100]], dolar, euro, gram ve ons altın, Bitcoin, Ethereum, S&P 500 ve Nasdaq'ın günlük yüzde değişimi. Yeşil yükseldi, kırmızı düştü demektir. Kripto piyasası için ayrıca \"Korku ve Açgözlülük\" göstergesi vardır.",
      },
      { type: "h", text: "Piyasa listeleri" },
      {
        type: "p",
        text: "Sayfanın altında her tür için ayrı bir liste vardır: **Kripto · BIST · ABD Hisseleri · ETF · Endeksler · Emtia · Döviz · Altın · Fonlar**. Bir sekmeye dokun, listenin içinde ara; görünen satırların canlı fiyatı ve günlük değişimi gelir. Liste uzunsa altta **Sonraki ›** ile sayfa değiştir. Satıra dokunmak varlık sayfasını açar, sağdaki **☆** ise izleme listesine ekler ya da çıkarır.",
      },
      {
        type: "list",
        items: [
          "**Kripto:** Binance'in USDT ve TL pariteleri ile BtcTurk'ün TL pariteleri. Aynı coin her borsada ayrı satırdır; üstteki düğmelerle borsaya göre süzebilirsin.",
          "**Binance Vadeli · Binance Alpha:** spotta olmayan coinler, her biri bir kez. **Vadeli** satırlarının fiyatı [[vadeli-kontrat|vadeli kontrat]] fiyatıdır (1 coin için; spottan biraz farklı olabilir). **Alpha** satırları henüz listelenmemiş [[binance-alpha|erken aşama]] tokenlardır; çok oynak ve yüksek risklidir. Bunlar yatırım tavsiyesi değildir.",
          "**Diğer (CoinGecko):** Binance ve BtcTurk'te hiç işlem görmeyen coinler (OKB, Cronos, Pi gibi). Fiyatı ve grafiği CoinGecko'dan gelir (birçok borsanın ortalaması, birkaç dakika gecikebilir; grafik en fazla son 1 yıl).",
          "**Sembol yazımı:** **BTC** = Binance BTC/USDT (fiyat dolar), **BTC-TRY** = Binance BTC/TL, **BTC@BTCTURK** = BtcTurk BTC/TL, **RATS@BINANCE-F** = Binance vadeli, **SHARE@BINANCE-ALPHA** = Binance Alpha, **OKB@COINGECKO** = CoinGecko fiyatı (üçü de dolar). TL paritelerinde fiyat, kâr/zarar ve işlem para birimi TL'dir.",
          "**Emtia:** altın (GC=F), gümüş (SI=F), petrol (CL=F, Brent BZ=F), doğalgaz (NG=F), bakır (HG=F) gibi vadeli fiyatlar, dolar cinsinden. Aramada \"gümüş\", \"petrol\" yazman yeterli.",
          "**Endeksler:** BIST 100, BIST 30, S&P 500, Nasdaq, DAX gibi endeksler puan olarak gösterilir.",
          "**BIST · ABD Hisseleri · ETF:** Borsa İstanbul'daki tüm hisseler ile Nasdaq ve NYSE'deki tüm ABD hisseleri ve ETF'ler; en bilinenler listenin başındadır. Midas gibi aracı kurum uygulamalarında gördüğün hisseler de buradadır, her biri tek satır.",
          "**Fonlar:** TEFAS'taki tüm fonlar. Üstteki düğmelerle **Yatırım fonları**, **Emeklilik (BES)** ya da **Borsa yatırım fonları** olarak süzebilir, fon kodu ya da şirket adıyla (örn. \"ak portföy\") arayabilirsin.",
        ],
      },
      { type: "h", text: "İzleme listesine eklemek" },
      {
        type: "steps",
        items: [
          "Piyasa sayfasında **İzleme listesi** başlığının yanındaki **+ Ekle**'ye bas.",
          "Aramak istediğini yaz: şirket kodu (ASELS), Türkçe kelime (altın, dolar, gümüş), kripto (BTC, BTC-TRY) ya da fon kodu (AFT).",
          "Sonuçlar türe göre gruplu gelir (Kripto, BIST, ABD Hisseleri…); her satırda ad · borsa · para birimi yazar. Birine dokun; varlık listene eklenir.",
        ],
      },
      { type: "tip", text: "[[izleme-listesi|İzleme listesi]], para harcamadan bir varlığı tanımanın en kolay yoludur. Birkaç hafta izle, sonra istersen sanal olarak dene." },
      { type: "h", text: "Varlık sayfası" },
      {
        type: "p",
        text: "Herhangi bir varlığa dokununca kendi sayfası açılır: 1 gün ile 5 yıl arası fiyat grafiği, teknik analiz, son haberler, \"Neden hareket ediyor?\" ve KAP duyuruları. Buradaki **Sanal al**, **Emir ver**, **İşlem ekle** ve **Alarm kur** düğmeleri formları bu varlık seçili olarak açar.",
      },
      { type: "open", links: [{ href: "/piyasa", label: "Piyasa" }, { href: "/piyasa/detay?id=bist%3ATHYAO&ad=T%C3%BCrk%20Hava%20Yollar%C4%B1", label: "Örnek varlık sayfası (THYAO)" }] },
    ],
  },
  {
    id: "grafikler",
    title: "Grafikler, teknik analiz ve Sinyaller",
    summary: "Grafik katmanları, göstergeler ve sinyal skorunun anlamı.",
    blocks: [
      {
        type: "p",
        text: "Teknik analiz, geçmiş fiyat hareketlerine bakarak eğilimi anlamaya çalışmaktır. Geleceği bilemez; ama \"fiyat şu an hızlı mı yükseliyor, ortalamanın üstünde mi?\" gibi sorulara sade cevap verir.",
      },
      {
        type: "list",
        items: [
          "**Grafik katmanları:** varlık sayfasındaki grafikte 50 ve 200 günlük [[hareketli-ortalama|ortalamaları]], [[bollinger|Bollinger bantlarını]] ve altta [[rsi|RSI]] panelini açıp kapatabilirsin.",
          "**Teknik Analiz bölümü:** özet rozet (Güçlü Al'dan Güçlü Sat'a), bunun nedenleri ve her göstergenin sade açıklaması.",
          "**Sinyaller sayfası:** portföyündeki ve izleme listendeki tüm varlıkların sinyallerini tek listede gösterir; sinyale, RSI'a, değişime ya da ada göre sıralayabilirsin.",
        ],
      },
      { type: "h", text: "Sinyal skoru nasıl hesaplanır?" },
      {
        type: "p",
        text: "Her gösterge artı ya da eksi puan verir (örneğin RSI aşırı satımdaysa +, fiyat 200 günlük ortalamanın altındaysa −). Toplam +2 ve üstü **Al**, +5 ve üstü **Güçlü Al**; −2 ve altı **Sat**, −5 ve altı **Güçlü Sat**; arası **Nötr**'dür. Ayrıntı için: [[sinyal-skoru]].",
      },
      { type: "warn", text: "Sinyal bir öneri değil, bir özettir. \"Güçlü Al\" yazması fiyatın yükseleceği anlamına gelmez. Kararlarını tek bir sinyale dayandırma." },
      { type: "tip", text: "Göstergeleri hiç bilmiyorsan Eğitim'deki derslerle başla: mum grafiği, trend, RSI… Her ders birkaç dakika sürer." },
      { type: "open", links: [{ href: "/sinyaller", label: "Sinyaller" }, { href: "/egitim", label: "Eğitim dersleri" }] },
    ],
  },
  {
    id: "emirler",
    title: "Emirler",
    summary: "Koşullu al/sat emirlerinin uygulama içinde nasıl otomatik işlendiği.",
    blocks: [
      {
        type: "p",
        text: "Bir [[kosullu-emir|emir]], \"fiyat şu seviyeye gelince şunu al (ya da sat)\" talimatıdır. Örneğin: \"Gram altın 2.950 TL'nin altına inerse sanal portföye 5.000 TL'lik al.\"",
      },
      { type: "figure", figure: "emir-akisi", caption: "Emir kaydedilir, bekçi fiyatı düzenli kontrol eder, koşul sağlanınca işlem portföy kaydına yazılır ve zile bildirim düşer. Gerçek aracı kuruma hiçbir şey gitmez." },
      {
        type: "steps",
        items: [
          "Emirler sayfasında **+ Emir ver**'e bas (ya da varlık sayfasındaki **Emir ver** düğmesi).",
          "Varlığı, **Al** ya da **Sat** yönünü ve koşulu seç: fiyat ≤ tetik fiyatı (düşünce) ya da ≥ tetik fiyatı (yükselince).",
          "Tutar ya da adet gir ve hangi portföyde (gerçek ya da sanal) olacağını seç.",
          "Kaydet. Emir **Bekliyor** olarak listelenir; istediğin zaman iptal edebilirsin.",
        ],
      },
      {
        type: "p",
        text: "Bekleyen emirler yerel modda uygulama açıkken **30 saniyede bir**, bulut modunda çalar saatin sıklığında kontrol edilir. Koşul sağlanınca işlem onay beklenmeden portföy kaydına yazılır, emir **Gerçekleşti** olur ve bildirim gelir. İşlem yazılamazsa (örneğin elinde olandan fazla satış) emir **Başarısız** olarak kapanır ve bunun için de bildirim gelir.",
      },
      {
        type: "warn",
        text: "Emirler **gerçek bir aracı kuruma asla gitmez** ve gerçek para hareketi olmaz. \"Gerçek\" portföye verilen emir bile yalnızca kaydına işlem ekler. Gerçek alım satımı her zaman kendi bankanda ya da aracı kurumunda yaparsın.",
      },
      { type: "tip", text: "Fiyata bakmak yerine yalnızca haber almak istiyorsan emir yerine alarm kur (bir sonraki bölüm)." },
      { type: "open", links: [{ href: "/emirler", label: "Emirler" }] },
    ],
  },
];
