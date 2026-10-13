# 🌸 Regl & Semptotermal Döngü Takibi

İstemci taraflı, **sıfır sunuculu** ve mahremiyet odaklı bilimsel semptotermal döngü takip progresif web uygulaması (PWA).

Uygulama sunucuya hiçbir veri göndermez; tüm sağlık kayıtları doğrudan kullanıcının kendi cihazında (IndexedDB) saklanır.

---

## 🎯 Özellikler

- **Çift Takip Modu:**
  - **Temel Mod:** Adet kanaması ve Üstel Ağırlıklı Hareketli Ortalama (EWMA) ile gelecek döngü tahmini.
  - **İleri Semptotermal Mod:** Bazal Vücut Isısı (BBT) + Servikal Mukus çift kontrolü ile klinik Sensiplan ovülasyon kuralları.
- **Bilimsel Doğruluk:**
  - Kaplama çizgisi (*coverline*), 3 ardışık yüksek ölçüm doğrulaması ve İstisna 1 & İstisna 2 kuralları.
  - Mukus hissi ve görünümünden türetilen Sensiplan kategorileri (`t`, `f`, `S`, `S+`) ve Mukus Zirve Günü tespiti.
  - Pre-ovülatuar Eksi-8, Eksi-20 ve acil mukus kesme kuralı.
  - Her değerlendirme için "Neden?" klinik gerekçe açıklaması.
- **Kişiselleştirilmiş SVG Grafik Motoru:**
  - BBT eğrisi, yatay kaplama çizgisi, 1-2-3 yüksek ölçüm numaraları, parantezli bozucu ölçümler ve mukus/kanama şeridi.
- **Çevrimdışı ve Sıfır Bilgi:**
  - Ağ çağrısı yok (CSP meta kuralı ile zorunlu kılınmıştır).
  - Web Crypto API (PBKDF2-SHA256 600.000 iterasyon + AES-GCM 256-bit zarf şifreleme).
  - `navigator.storage.persist()` ile cihaz temizliğine karşı kalıcı depolama.
- **Cihaz Entegrasyonu & Hatırlatıcılar:**
  - Samsung Calendar ve Google Calendar uyumlu RFC 5545 standartlarında `.ics` takvim dışa aktarımı.
  - Tek dokunuşla JSON ve CSV (Hekim raporu) dışa aktarma / içe aktarma (Web Share API).
- **Samsung One UI Ergonomisi:**
  - Ekranın alt yarısında tek elle 10 saniyede veri girişine uygun tasarım tokenları ve dokunma hedefleri (≥ 48px).

---

## 🚀 Yerel Geliştirme

Gereksinimler: Node.js 20+ veya 22 LTS

```bash
# Bağımlılıkları yükleyin
npm install

# Geliştirme sunucusunu başlatın
npm run dev

# Tip denetimi
npm run typecheck

# Birim ve özellik (property-based) testlerini çalıştırın
npm run test

# Test kapsam raporu
npm run test:coverage

# Kod biçimlendirme ve linter
npm run lint

# Üretim paketini derleyin
npm run build
```

---

## 📲 Telefona Kurulum (Android / Samsung Galaxy)

1. GitHub Pages üzerinden yayınlanan URL'yi telefonun tarayıcısında (**Google Chrome** veya **Samsung Internet**) açın.
2. Tarayıcı menüsünden (üç nokta veya alt menü):
   - **"Ana Ekrana Ekle"** veya **"Uygulamayı Yükle"** seçeneğine dokunun.
3. Uygulama artık bağımsız bir uygulama olarak ana ekranınıza eklenir; internet bağlantısı olmasa dahi tam hızda çevrimdışı açılır.
4. Ayarlar ekranından depolama durumunun **"Kalıcı Depolama: Aktif ✅"** olduğunu teyit edebilirsiniz.

---

## 🌐 GitHub Pages ile Yayınlama

Deponuzda `.github/workflows/deploy.yml` iş akışı hazırdır.

1. Projenizi GitHub'da yeni bir depoya yükleyin (`git push -u origin main`).
2. GitHub deponuzun **Settings** > **Pages** bölümüne gidin.
3. **Build and deployment** > **Source** seçeneğini **GitHub Actions** olarak ayarlayın.
4. `main` dalına her push yapıldığında uygulamanız otomatik derlenip GitHub Pages adresinizde (`https://<kullanici-adi>.github.io/<depo-adi>/`) sıfır maliyetle yayınlanacaktır.

---

## 🧪 Test Stratejisi ve Doğrulama

- **59 Birim ve Özellik Testi:** `vitest` ve `fast-check` ile matematiksel değişmezler, artık yıllar, EWMA sapmaları ve Sensiplan kuralları doğrulanmıştır.
- **Katı TypeScript:** `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noImplicitOverride` bayrakları devrededir.

---

## ⚠️ Yasal Uyarı

Bu yazılım tıbbi bir teşhis cihazı veya hekim tavsiyesi değildir. Yalnızca kişisel sağlık ve döngü farkındalığı amacıyla tasarlanmıştır. Semptotermal yöntemin gebelik önleme amacıyla kullanımında Sensiplan eğitim kaynaklarının incelenmesi tavsiye edilir.
