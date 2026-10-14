# 🌸 Regl & Semptotermal Döngü Takibi

İstemci taraflı, **sıfır sunuculu** ve tam mahremiyet odaklı, bilimsel Sensiplan semptotermal döngü takip Progresif Web Uygulaması (PWA).

Uygulama internete veya herhangi bir uzak sunucuya **hiçbir veri göndermez**. Tüm sağlık kayıtları sadece ve sadece kullanıcının kendi cihazında (IndexedDB) saklanır.

---

## 🛡️ Mahremiyet ve Sıfır Bilgi Mimarisi

- **Sıfır Sunucu & Sıfır İzleyici:** Veritabanı ve backend sunucusu bulunmaz; üçüncü taraf analitik, izleme veya harici yazı tipi (font) kütüphaneleri kullanılmaz.
- **Sıkı İçerik Güvenlik Politikası (CSP):** `default-src 'self'` ile dış dünyayla ağ bağlantısı kurulması tarayıcı seviyesinde kesin olarak engellenmiştir.
- **Kriptografik Kasa (Opsiyonel Kilit):** Cihaz üzerinde çalışan Web Crypto API ile PBKDF2-SHA256 (600.000 iterasyon) ve AES-GCM 256-bit zarf şifreleme (Envelope Encryption).
- **Görev Yöneticisi Gizlilik Maskesi:** Android Son Uygulamalar (Task Switcher / Multitasking) önizlemesinde sağlık verilerinin ekran görüntüsünün sızmaması için arka plana atıldığında otomatik opak maske katmanı devreye girer.
- **Hareketsizlik Otomatik Kilidi:** Kasa aktifken telefon açık bırakılırsa 3 dakika sonra uygulama kendiliğinden kilitlenir.
- **Kaba Kuvvet Koruması:** 3 ve 5 hatalı PIN/parola denemesinde artan bekleme süreleri (5 sn ve 30 sn) ile giriş alanı kilitlenir.

---

## 🎯 Özellikler

### 1. Çift Takip Modu
- **Temel Mod:** Adet kanaması, günlük belirtiler ve Üstel Ağırlıklı Hareketli Ortalama (EWMA) ile sonraki regl tahminleri.
- **İleri Semptotermal Mod:** Bazal Vücut Isısı (BBT) + Servikal Mukus çift kontrolü ile klinik Sensiplan doğal aile planlaması kuralları.

### 2. Klinik Sensiplan Doğruluğu
- **Sıcaklık Değerlendirmesi (T1–T6):** Otomatik yatay kaplama çizgisi (*coverline*), 3 ardışık yüksek ölçüm tespiti, İstisna 1 (0.2 °C şartı) ve İstisna 2 (4. yüksek ölçüm) kuralları.
- **Mukus Çift Ekseni (M1–M2):** Hissiyat (kuru, nemli, ıslak/kaygan) ve görünümden (kremsi, şeffaf, uzayan) türetilen Sensiplan kategorileri (`t`, `f`, `S`, `S+`) ile Mukus Zirve Günü tespiti.
- **Çift Kontrol (Double-Check D1):** Ateş yükselişi ve mukus zirvesi ortaklaşa teyit edilmeden kısır döneme geçilmez.
- **Pre-ovülatuar Faz (E1–E4):** Eksi-8, Eksi-20 kuralları ve döngü başında beklenmedik mukus görüldüğünde doğurganlık penceresini anında açan acil kural.
- **Şeffaf Klinik Açıklama:** Her değerlendirme için kullanıcıya kararın hangi kurala dayandığını gösteren "Neden?" bilgi kartı.

### 3. Zengin SVG Görselleştirme Paketi
- **Klinik Döngü Grafiği:** BBT eğrisi, kaplama çizgisi, 1-2-3 yüksek ölçüm numaraları, parantezli ve eğik çizgili bozucu ölçümler, mukus ve kanama şeridi.
- **Çoklu Döngü Sıcaklık Bindirme:** Son döngülerin ateş eğrilerini ortak döngü günü ekseninde üst üste bindirerek ovülasyon düzenini karşılaştırma.
- **Döngü Süreleri Trend Koridoru:** 24–35 günlük normal klinik koridor ve medyan döngü çizgisiyle geçmiş döngülerin dalgalanması.
- **Kanama Yoğunluğu Akış Grafiği:** Döngünün 1–7. günleri arasında kanama şiddetinin gün gün seyri.
- **Faz Süreleri Dağılımı:** Foliküler ve luteal faz sürelerinin döngü bazında dökümü.
- **Semptom Faz Dağılımı:** Belirtilerin (baş ağrısı, kramp, şişkinlik vb.) döngü fazlarına göre yoğunluğu.
- **Termal Sıcaklık Değişimi ($\Delta T$):** Ovülasyon öncesi bazal ısı ile ovülasyon sonrası luteal ısı arasındaki net fark.

### 4. Felaket Kurtarma & Güvenli Depolama
- **Otomatik Dönen Snapshot (Kurtarma Noktaları):** Her 7 günde bir IndexedDB'de otomatik yerel yedek alınır; son 4 hafta güvenle saklanır.
- **30 Günlük Harici Yedek Bildirimi:** Telefonun kaybolması, sıfırlanması veya bozulması riskine karşı 30 gün boyunca harici yedek alınmadığında kullanıcıyı nazikçe uyarır.
- **Kalıcı Depolama Garantisi:** `navigator.storage.persist()` ile Android tarayıcısının otomatik önbellek temizliklerinde veritabanının silinmesi engellenir.
- **Tek Dokunuşla Yedekleme:** Web Share API ve standart indirme ile JSON ve hekimle paylaşılabilir CSV raporları.
- **Period Calendar (.pc / .bak) Doğrudan İçe Aktarma:** Popüler döngü takip uygulamalarından (Period Calendar / My Calendar / Simple Design) alınan `.pc` veya `.bak` yedekleri, doğrudan telefonun tarayıcısından (saf TypeScript ile yazılmış hafif ZIP & SQLite B-Tree motoruyla) sıfır-sunucu güvencesiyle Regl uygulamasına aktarılabilir.

### 5. Samsung Galaxy & Android PWA Ergonomisi
- **One UI Başparmak Erişilebilirliği:** Ekranın alt 2/3'lük kısmına yerleştirilmiş hızlı giriş çipleri ve minimum 48px dokunma alanları.
- **Donanım / Hareket Geri Tuşu Yönetimi:** `popstate` entegrasyonu sayesinde Android geri kaydırması uygulamadan çıkmak yerine sekmeler arası geri dönüş sağlar.
- **Gece Yarısı Devri:** Uygulama gece açık kalsa dahi gün değiştiğinde otomatik güncel güne odaklanır.
- **Çevrimdışı Takvim:** Samsung Calendar (S Planner) ve Google Calendar ile tam uyumlu RFC 5545 standartlarında `.ics` takvim etkinlikleri.

---

## 🛠️ Teknoloji Yığını

| Katman | Teknoloji | Seçim Gerekçesi |
|---|---|---|
| **Dil** | TypeScript 5.8 (Strict) | Tip güvenliği, sağlık ve tarih hesaplamalarında sıfır hata toleransı |
| **Arayüz** | Preact + @preact/signals | ~4 KB çekirdek, anında soğuk açılış, reaktif sinyal durumu |
| **Derleme** | Vite 6 | Modern ES modülleri, hızlı HMR ve optimize üretim paketi |
| **Depolama** | IndexedDB (`idb`) | 5 yıllık sağlık kaydını (~2.000 gün) sıfır gecikmeyle telefonda saklama |
| **Doğrulama**| Valibot | Yedek dosyaları ve depolama için ultra hafif şema doğrulama |
| **Kripto** | Web Crypto API | Yerel PBKDF2-SHA256 ve AES-GCM (ek bağımlılık yok) |
| **Grafik** | El yapımı saf SVG | Sensiplan standartlarına uygun tıbbi çizimler ve performans |
| **PWA** | vite-plugin-pwa (Workbox)| Çevrimdışı Service Worker önbellekleme |
| **Test** | Vitest + fake-indexeddb | 80/80 birim, kripto ve kural testi |

---

## 🚀 Yerel Geliştirme

Gereksinimler: Node.js 20+ veya 22 LTS

```bash
# Depoyu klonlayın
git clone https://github.com/VelliDR/regl.git
cd regl

# Bağımlılıkları yükleyin
npm install

# Geliştirme sunucusunu başlatın
npm run dev

# Tip denetimi
npm run typecheck

# Birim ve algoritma testlerini çalıştırın (91 test)
npm run test

# Period Calendar .pc/.bak yedeğini Regl JSON formatına dönüştürün
npm run convert:pc yedek.pc regl-yedek.json

# Linter kontrolü
npm run lint

# Üretim paketini derleyin
npm run build
```

---

## 📲 Telefona Kurulum (Android / Samsung Galaxy)

1. GitHub Pages üzerinden yayınlanan bağlantıyı telefonunuzun tarayıcısında (**Google Chrome** veya **Samsung Internet**) açın.
2. Tarayıcı menüsünden (üç nokta veya sağ alt menü):
   - **"Ana Ekrana Ekle"** veya **"Uygulamayı Yükle"** seçeneğine dokunun.
3. Uygulama bağımsız bir uygulama olarak ana ekranınıza eklenir; internet bağlantınız olmasa bile çevrimdışı çalışır.
4. Ayarlar bölümünden depolama durumunun **"Kalıcı Depolama: Aktif ✅"** olduğunu kontrol edebilirsiniz.

---

## 🌐 GitHub Pages ile Dağıtım (CI/CD)

Depoda `.github/workflows/deploy.yml` iş akışı bulunmaktadır.

1. GitHub deponuzun **Settings** > **Pages** bölümüne gidin.
2. **Build and deployment** > **Source** alanını **GitHub Actions** olarak seçin.
3. `main` dalına yapılan her güncellemede uygulamanız otomatik derlenip `https://<kullanici-adi>.github.io/regl/` adresinde ücretsiz ve güvenle yayınlanır.

---

## 🧪 Test Paketi ve Doğrulama

- **91 Birim ve Kural Testi:** Tüm tarih hesaplamaları, Sensiplan T1–T6 / M1–M2 / D1 / E1–E4 kuralları, kriptografi zarf şifrelemesi, IndexedDB işlemleri, afet kurtarma snapshots ve Period Calendar SQLite aktarım testleri eksiksiz geçmektedir.
- **Katı TypeScript:** `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` ve `noImplicitOverride` bayrakları etkindir.
- **~40 kB Gzipped İlk Yükleme:** Tüm uygulama kütüphaneleri ve grafikleriyle birlikte optimize bir üretim çıktısına sahiptir; göç modülü dinamik kod bölümleme (`code-splitting`) ile lazy-load edilir.

---

## ⚠️ Yasal ve Tıbbi Uyarı

Bu yazılım tıbbi bir teşhis cihazı veya hekim tavsiyesi niteliğinde değildir. Yalnızca kişisel sağlık ve döngü farkındalığı amacıyla tasarlanmıştır. Semptotermal yöntemin gebelikten korunma veya gebelik planlama amacıyla kullanımında resmi Sensiplan eğitim kaynaklarının (*Natürlich & sicher*) incelenmesi tavsiye edilir.

---

## 📄 Lisans

MIT License. Tüm hakları saklıdır.
