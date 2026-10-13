# ADR 0001: Saf PWA, IndexedDB ve Kalıcı Depolama Mimarisi

- **Tarih:** 2026-10-13
- **Durum:** Kabul Edildi (Accepted)

## Bağlam (Context)
Uygulama, sıfır sunucu ve sıfır bilgi (zero-knowledge) mahremiyet prensibini benimseyecektir. Sağlık verileri yalnızca kullanıcının yerel cihazında saklanmalı, üçüncü taraf sunuculara veya izleyicilere iletilmemelidir. Dağıtımın GitHub Pages üzerinden statik olarak yapılması planlanmaktadır.

Alternatifler değerlendirilmiştir:
1. Saf PWA (Web Standartları, IndexedDB, Service Worker)
2. Capacitor ile paketlenmiş yerel Android APK
3. Saf Yerel Uygulama (Kotlin/Android)

## Karar (Decision)
Uygulama **Saf PWA** olarak geliştirilecektir:
- Depolama katmanı: IndexedDB (`idb` kütüphanesi).
- Kalıcılık: Uygulama açılışında `navigator.storage.persist()` çağrılarak işletim sisteminin veri tahliyesi (eviction) engellenecektir.
- Çevrimdışı çalışma: `vite-plugin-pwa` (Workbox) ile `registerType: 'prompt'` modunda Service Worker kurulacaktır.
- Hatırlatıcılar: PWA arka planda kapalıyken sunucusuz zamanlanmış yerel bildirim tetikleyemediğinden; Samsung Calendar ve Google Calendar uyumlu `.ics` / Android Intent dışa aktarımı ile cihaz takvimine alarm içeren etkinlikler yazılacaktır.

## Sonuçlar (Consequences)
- **Olumlu:** Sıfır sunucu maliyeti, anında URL üzerinden erişim, mağaza onay süreçlerine bağımlı olmama, tek kod tabanı, arkadaşlara kolayca önerebilme imkânı.
- **Olumsuz:** PWA'nın arka planda kapalıyken kendi başına alarm çalamaması; bu kısıt takvim entegrasyonu ve telefon alarmı yönlendirmesiyle aşılmıştır. İhtiyaç halinde aynı kod tabanı gelecekte doğrudan Capacitor APK'ya dönüştürülebilir.
