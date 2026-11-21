# Bulut kurulumu (Vercel + Neon)

Bu rehber uygulamayı bilgisayarınız kapalıyken de çalışacak şekilde internete taşır. Hepsi
**ücretsiz planlarla** yapılır. Adımları sırayla, acele etmeden izleyin; her adımın sonunda
"Kontrol" satırı neyi görmeniz gerektiğini söyler.

## Önce: ne değişiyor?

Şu an uygulama bir **dükkân gibi bilgisayarınızda** çalışıyor: veriler bilgisayardaki tek bir
dosyada (`data/yatirim.db`), emirleri ve alarmları bilgisayar açıkken 30 saniyede bir kontrol
eden bir "bekçi" var.

Bulutta üç parça olacak:

| Parça | Ne işe yarar | Benzetme |
|---|---|---|
| **Vercel** | Uygulamanın kendisi (sayfalar) | Dükkânın vitrini |
| **Neon** | Veritabanı (işlemler, emirler, ayarlar) | Kasa / defter |
| **cron-job.org** (+ GitHub yedeği) | Her dakika uygulamayı "dürter", emir ve alarm kontrolü yapılır | Bekçinin çalar saati |

Bulutta sürekli açık bir bilgisayar olmadığı için bekçi kendi kendine uyanamaz; onu dışarıdan
bir çalar saat (cron-job.org) uyandırır. Seçtiğiniz sıklık: **hafta içi 09:30–18:30 her dakika,
diğer zamanlarda 30 dakikada bir.** cron-job.org her dakika çağırır; uygulama mesai dışındaki
çağrıları veritabanını uyandırmadan geri çevirir, böylece Neon gece ve hafta sonu uyuyabilir
(ücretsiz kotayı korur).

> **Önemli:** Yerel kullanım aynen devam eder. Bilgisayardaki `.env` dosyasına
> `DATABASE_URL` **yazmayın**; o satır doluysa uygulama bilgisayarda da buluta bağlanmaya çalışır.
> Bulut bilgileri yalnızca Vercel'e ve (taşıma için) `.env.bulut` dosyasına girilir.

Gerekenler: bir e-posta adresi, bu bilgisayar, yaklaşık 45 dakika.

---

## 1. Gizli anahtarları hazırlayın

Üç rastgele değer gerekiyor. Proje klasöründe bir terminal açın (Baslat.bat'ın olduğu klasör)
ve şu komutu **üç kez** çalıştırın; her seferinde çıkan uzun yazıyı bir not dosyasına kopyalayın:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Not dosyanıza şöyle yazın:

- `SESSION_SECRET` = 1. değer (giriş çerezini imzalar)
- `CRON_SECRET` = 2. değer (çalar saatin şifresi)
- `APP_PASSWORD` = bulutta gireceğiniz giriş şifresi (kendiniz seçin, **uzun ve tahmin edilemez** olsun;
  uygulama artık internete açık olacak)

Kontrol: not dosyasında üç satır var. Bu dosyayı kimseyle paylaşmayın.

## 2. GitHub: kodu özel (private) bir depoya koyun

1. <https://github.com> → **Sign up** ile hesap açın (e-postanızı doğrulayın).
2. Sağ üstteki **+** → **New repository**.
   - Repository name: `yatirim`
   - **Private** seçin (çok önemli: kod herkese açık olmasın).
   - Diğer kutuları işaretlemeyin → **Create repository**.
3. Açılan sayfadaki adresi kopyalayın (örn. `https://github.com/kullanici/yatirim.git`).
4. Proje klasöründeki terminalde:

   ```bash
   git remote add origin https://github.com/KULLANICI/yatirim.git
   git push -u origin master
   ```

   İlk seferde tarayıcıda GitHub girişi istenir; onaylayın.

Kontrol: GitHub'daki depo sayfasında dosyalar görünüyor, yanında kilit simgesi ve "Private" yazıyor.
`data` klasörü ve `.env` dosyası **görünmüyor** (bunlar bilerek gönderilmez).

## 3. Neon: veritabanını oluşturun (Frankfurt)

1. <https://neon.tech> → **Sign up** (GitHub hesabınızla girmek en kolayı).
2. **Create project**:
   - Project name: `yatirim`
   - Region: **AWS Europe Central 1 (Frankfurt)** — uygulamayla aynı bölge, hızlı olur.
   - Postgres sürümü: önerilen (varsayılan) kalsın → **Create**.
3. Proje panelinde **Connect** düğmesine basın. İki adres gerekiyor:
   - **Connection pooling açık** iken görünen adres (içinde `-pooler` geçer) → bu `DATABASE_URL`
   - **Connection pooling kapalı** iken görünen adres → bu `DATABASE_URL_UNPOOLED`

   İkisini de not dosyanıza kopyalayın (şifre içerir, gizli tutun).

Kontrol: not dosyanızda `postgresql://...` ile başlayan iki adres var; biri `-pooler` içeriyor.

## 4. Vercel: uygulamayı yayına alın

1. <https://vercel.com> → **Sign Up** → **Hobby** (ücretsiz) → **Continue with GitHub**.
2. **Add New… → Project** → listede `yatirim` deposunu bulun → **Import**.
   (Görünmüyorsa "Adjust GitHub App Permissions" ile depoya izin verin.)
3. Import ekranında:
   - Framework: **Next.js** (kendisi seçer). Build ayarlarına dokunmayın.
   - **Environment Variables** bölümüne şunları tek tek ekleyin (Name / Value):

     | Name | Value |
     |---|---|
     | `APP_PASSWORD` | 1. adımdaki giriş şifreniz |
     | `SESSION_SECRET` | 1. adımdaki 1. değer |
     | `CRON_SECRET` | 1. adımdaki 2. değer |
     | `DATABASE_URL` | Neon'un `-pooler` içeren adresi |
     | `DATABASE_URL_UNPOOLED` | Neon'un havuzsuz adresi |
     | `ANTHROPIC_API_KEY` | (isteğe bağlı) Claude anahtarınız; boş bırakıp sonra Ayarlar'dan da ekleyebilirsiniz |

4. **Deploy**. Yayına alma sırasında veritabanı tabloları **otomatik** kurulur
   (`vercel-build` önce `db:migrate` çalıştırır).
5. Bitince proje **Settings → General → Node.js Version**: **24.x** seçili olsun (değilse seçip
   **Deployments** sekmesinden son yayını **Redeploy** edin).

> Neon'u Vercel'e bağlamanın bir diğer yolu: Vercel projesinde **Storage → Connect Database → Neon**
> (Neon entegrasyonu). Bu yol `DATABASE_URL` ve `DATABASE_URL_UNPOOLED` değişkenlerini kendisi ekler;
> bölge olarak yine **Frankfurt** seçin. Yukarıdaki elle ekleme de aynı sonucu verir; ikisinden
> birini yapmanız yeterli.

Kontrol: Vercel "Congratulations" der ve bir adres verir (örn. `https://yatirim-abcd.vercel.app`).
Adresi açın, giriş sayfası gelsin, şifrenizle girin. Bu adresi not dosyanıza `APP_URL` olarak yazın.
Sunucu bölgesi Frankfurt (fra1) olarak vercel.json dosyasında ayarlıdır; ayrıca bir şey seçmeniz gerekmez.

## 5. Verilerinizi bilgisayardan Neon'a taşıyın

Bilgisayardaki işlemleriniz, emirleriniz, ayarlarınız buluta kopyalanır. Kaynak dosya değişmez.

1. Bilgisayardaki uygulamayı kapatın (Baslat.bat penceresini kapatın) — taşıma sırasında yeni kayıt girmesin.
2. Proje klasöründe `.env.bulut` adında bir dosya oluşturun (Not Defteri ile) ve içine yalnızca şunu yazın:

   ```
   DATABASE_URL_UNPOOLED=postgresql://...(Neon'un havuzsuz adresi)...
   ```

   Bu dosya GitHub'a gönderilmez (.gitignore'da).
3. Önce **deneme** (hiçbir şey kaydetmez, yalnızca sayar ve karşılaştırır):

   ```bash
   npm run tasi:neon -- --kaynak data/yatirim.db --deneme
   ```

   Ekranda tablo tablo "kaynak / hedef" sayıları çıkar; hepsi eşit olmalı ve sonunda
   "DENEME: sayılar doğrulandı" yazmalı.
4. Gerçek taşıma:

   ```bash
   npm run tasi:neon -- --kaynak data/yatirim.db
   ```

   Sonunda "Taşıma tamamlandı; satır sayıları doğrulandı." yazar.
   (Neon'da zaten veri varsa durur; bilerek silip yeniden yüklemek için sona `--uzerine-yaz` ekleyin.)

Kontrol: bulut adresinde portföyünüzü, hesaplarınızı ve işlemlerinizi görüyorsunuz.

> Bundan sonra **tek bir yeri** kullanın (bulutu). İkisine birden işlem girerseniz veriler ayrışır.
> Şema kurulumunu elle yapmanız gerekirse: `.env.bulut` hazırken `npm run db:migrate`.

## 6. cron-job.org: çalar saati kurun (asıl nöbet)

1. <https://cron-job.org> → **Sign up** (ücretsiz) → e-postayı doğrulayın → giriş.
2. **Dashboard → Create cronjob**:
   - Title: `yatirim nöbet`
   - URL: `https://SIZIN-ADRESINIZ.vercel.app/api/cron/tick`
   - Execution schedule: **Every 1 minute** (her dakika)
   - **Advanced** sekmesi:
     - Request method: **GET**
     - **Headers → Add**: Key `Authorization`, Value `Bearer CRON_SECRET_DEĞERİNİZ`
       (Bearer'dan sonra bir boşluk, sonra 1. adımdaki 2. değer)
     - Timeout: varsayılan (30 saniye) kalabilir.
   - **Create** / **Save**.
3. Birkaç dakika bekleyin, iş satırındaki **History**'ye bakın.

Kontrol: History'de `200 OK` satırları görünür. Yanıtta mesai dışında `"skipped":"pencere dışı…"`
yazması normaldir (veritabanı uyusun diye). `401` görürseniz başlık yanlıştır: `Bearer` kelimesini
ve boşluğu kontrol edin.

## 7. GitHub yedek nöbeti (5 dakikada bir)

cron-job.org bir gün aksarsa diye GitHub da 5 dakikada bir dürter.

1. GitHub'da depo → **Settings → Secrets and variables → Actions**.
2. **Secrets** sekmesi → **New repository secret**: Name `CRON_SECRET`, Secret: 1. adımdaki 2. değer → **Add secret**.
3. **Variables** sekmesi → **New repository variable**: Name `APP_URL`, Value: `https://SIZIN-ADRESINIZ.vercel.app`
   (sonunda `/` olmadan) → **Add variable**.
4. Depoda **Actions** sekmesi → (istenirse "I understand… enable" ile açın) → solda **Nöbet** →
   **Run workflow** → `force` kutusunu işaretleyin → **Run workflow**.

Kontrol: birkaç saniye sonra iş yeşil tik alır. GitHub zamanlanmış işleri bazen birkaç dakika geç
çalıştırır; bu yüzden asıl saat cron-job.org'dur.

## 8. Deneme

1. Bulut adresinde giriş yapın → **Ayarlar**:
   - "Nöbet (otomatik kontroller)" kartında **Son nöbet: x dk önce** görünmeli. Mesai içinde 1–2
     dakikadan, mesai dışında 30 dakikadan eski olmamalı; eskiyse sarı uyarı çıkar.
   - "Yedekleme (bulut)": **Tüm verilerimi indir (JSON)** ile bir kopya indirin ve saklayın.
2. Küçük bir sanal pozisyon açın, sonra koşulu hemen sağlanan bir sanal emir verin (örn. BTC,
   "fiyat ≥ 1"). Emir birkaç saniye içinde **Emirler**'de "gerçekleşti" olmalı.
3. Telefonda bulut adresini açın → "Ana ekrana ekle" → uygulamadan **Ayarlar → Bildirimleri aç**.
   (Artık Tailscale gerekmez.)
4. Elle nöbet denemesi (isteğe bağlı, bilgisayardan):

   ```bash
   curl -H "Authorization: Bearer CRON_SECRET_DEĞERİNİZ" "https://SIZIN-ADRESINIZ.vercel.app/api/cron/tick?force=1"
   ```

   `"ok":true` ve çalışan görevlerin listesi döner.

## Bilmeniz gerekenler

- **Ücretsiz sınırlar:** Neon Free ayda 100 hesaplama saati (CU-saat) ve 1 GB verir; seçilen nöbet
  sıklığıyla tahmini kullanım ayda ~70 CU-saattir (mesai içinde veritabanı uyanık kalır, dışında
  saatte iki kez kısa süre uyanır). Neon panelindeki **Usage** sayfasından izleyebilirsiniz.
  Vercel Hobby kişisel kullanım içindir.
- **Yedek:** Bulutta dosya yedeği yoktur. Ayarlar'dan ara sıra **Tüm verilerimi indir (JSON)**.
  Neon ayrıca kısa bir süre geriye dönebilir (panel → **Restore**; ücretsiz planda süre kısadır).
  JSON dosyası 4 MB'tan büyükse geri yükleme için `tasi:neon` benzeri komut satırı yolunu kullanın.
- **Fiyat kaynakları:** Yahoo bazen bulut sunucularına "çok istek" (429) hatası verir; o sırada son
  bilinen fiyat "gecikmeli" işaretiyle gösterilir ve emir/alarm bayat fiyatla **çalışmaz**. Binance
  engellerse otomatik olarak `data-api.binance.vision` kullanılır. TEFAS / KAP / altın kaynakları
  buluttan erişilemezse son kayıtlı değerler kullanılır.
- **Mesai dışı:** 18:30 sonrası ve hafta sonu emirler/alarmlar 30 dakikada bir kontrol edilir
  (kripto gibi 7/24 işlem gören varlıklar için gecikme olabilir). KAP 08:00–22:00 arası çekilir.
- **Günlük özet** (18:45 sonrası) mesai dışında olduğu için 19:00 nöbetinde hazırlanır.

## Sorun giderme

| Belirti | Çözüm |
|---|---|
| Sayfada "Sunucu hatası" ve Vercel günlüğünde "Veritabanı şeması eksik" | `.env.bulut` hazırken `npm run db:migrate`, sonra Vercel'de Redeploy |
| cron-job.org History'de 401 | Header değeri `Bearer <CRON_SECRET>` olmalı; Vercel'deki `CRON_SECRET` ile birebir aynı |
| Ayarlar'da "Son nöbet" sarı | cron-job.org işinin **Enabled** olduğunu ve History'yi kontrol edin |
| Giriş yapılamıyor | Vercel'deki `APP_PASSWORD`'ü kontrol edin; değiştirdiyseniz Redeploy edin |
| Fiyatlar "gecikmeli" | Kaynak geçici olarak erişilemiyor; birkaç dakika sonra kendiliğinden düzelir |
