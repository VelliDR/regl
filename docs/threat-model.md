# Tehdit Modeli (Threat Model)

Bu belge, uygulamanın güvenlik ve mahremiyet sınırlarını açıkça tanımlar. Sıfır sunuculu ve istemci taraflı bir sistemde "kimden, neyi koruduğumuz" netleştirilmiştir.

---

## 1. Varlıklar (Korumak İstediğimiz Veriler)

1. **Ham Sağlık Kayıtları:**
   - Adet kanaması tarihleri ve yoğunlukları.
   - Bazal Vücut Isısı (BBT) ölçümleri ve ölçüm saatleri.
   - Servikal mukus gözlemleri (his ve görünüm).
   - Serviks konumu/sertliği.
   - Belirtiler (ağrı, göğüs hassasiyeti vb.), ruh hali, notlar ve cinsel aktivite kayıtları.
2. **Türetilmiş Değerlendirmeler:**
   - Doğurganlık penceresi ve ovülasyon tarihleri.
   - Gelecek regl tahminleri.
3. **Kullanıcı Ayarları ve Metaveriler:**
   - Kullanıcı tercihleri, kilit ayarları, son yedekleme zamanı.

---

## 2. Tehdit Aktörleri ve Kapsam

| Aktör | Tanım | Kapsamda mı? | Karşı Önlem |
|---|---|---|---|
| **Ağ Gözetleyicileri / ISS** | Ağ trafiğini dinleyen veya araya giren taraflar | ✅ Kapsamda | Sıfır sunucu, sıfır harici API. Katı CSP (`connect-src 'self'`). Hiçbir veri ağa çıkmaz. |
| **Üçüncü Taraf Analitik/İzleyiciler** | Reklam şirketleri, izleme kütüphaneleri | ✅ Kapsamda | Hiçbir SDK / izleyici kod tabanına dahil edilmez. Statik fontlar ve yerel varlıklar. |
| **Cihazı Eline Alan Biri (Omuz/Partner/Arkadaş)** | Cihaza fiziksel veya geçici erişim sağlayan kişi | ✅ Kapsamda | İsteğe bağlı şifreli kasa (Web Crypto AES-GCM + PBKDF2). Kilit ekranı bildirimlerinde genel başlık ("Hatırlatıcı"). |
| **Tarayıcı Eklentileri (Kötü Amaçlı)** | Tarayıcıda çalışan yetkisiz eklentiler | ⚠️ Kısmi | Ana ekrana eklenen PWA (standalone) eklenti bağlamı dışında çalışır; web sürümünde risk mevcuttur. |
| **Gelişmiş Adli Bilişim / Root Erişimi** | Cihaza tam adli erişim (Cellebrite vb.) veya root yetkisi | ❌ Kapsam Dışı | Donanım güvenliği kırılmış bir ortamda tarayıcı bellek veya disk dökümü okunabilir. |

---

## 3. Depolama ve Kriptografi İlkeleri

1. **Hiçbir Sağlık Alanı Düz Metin İndekslenmez:**
   - Günlük kayıtlar indeksli birincil anahtarlar (`bbt`, `bleeding`) taşımayacaktır.
   - Kilit devredeyken kayıt gövdesi AES-GCM 256-bit ile şifrelenir.
2. **Zarf Şifreleme (Envelope Encryption):**
   - Rastgele bir Veri Şifreleme Anahtarı (DEK) üretilir.
   - Paroladan PBKDF2-SHA256 (600.000 iterasyon) ile türetilen Anahtar Şifreleme Anahtarı (KEK), DEK'i sarmalar (wrap).
   - Parola değiştiğinde sadece sarılı DEK yeniden şifrelenir.
3. **Bellek Güvenliği:**
   - Anahtar nesnesi `extractable: false` olarak RAM'de tutulur.
   - Uygulama arka plana geçtiğinde yapılandırılan süre sonunda (ör. 5 dk) anahtar bellekten silinir.
4. **Veri Egemenliği ve Yedekleme:**
   - Yedekleme dosyaları kullanıcı isteğiyle dışa aktarılır.
   - Şifreli dışa aktarmada `.reglvault` formatı kullanılır.
