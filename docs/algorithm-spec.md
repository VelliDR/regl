# Bilimsel Algoritma Şartnamesi (Algorithm Specification)

Bu şartname, `packages/core` (veya `src/core`) altında çalışan tüm tahmin ve değerlendirme kurallarını tanımlar. Her kural tekil bir `RuleId` ile etiketlenir ve doğrudan birim/özellik testlerine bağlanır.

---

## 1. Temel Mod: Döngü ve Kanama Tahmini

### [P1] Yetersiz Veri / Başlangıç Tahmini
- **Koşul:** Tamamlanmış döngü sayısı = 0.
- **Davranış:** Kullanıcının onboarding sırasında belirttiği döngü süresi (varsayılan: 28 gün) temel alınır.
- **Belirsizlik Bandı:** $\pm 4$ gün. Çıktı `lowConfidence: true` bayrağı taşır.

### [P2] Erken Aşama Ortalama Tahmini
- **Koşul:** Tamamlanmış döngü sayısı 1 veya 2.
- **Davranış:** Basit aritmetik ortalama: $\hat{L} = \frac{1}{n} \sum L_i$.
- **Belirsizlik Bandı:** $\pm 3$ gün.

### [P3] Üstel Ağırlıklı Hareketli Ortalama (EWMA)
- **Koşul:** Tamamlanmış döngü sayısı $\ge 3$.
- **Formül:** $\hat{L}_t = \alpha \cdot L_t + (1 - \alpha) \cdot \hat{L}_{t-1}$, varsayılan $\alpha = 0.3$.
- **Varyans / Sapma:** $\sigma^2_t = \alpha \cdot (L_t - \hat{L}_{t-1})^2 + (1 - \alpha) \cdot \sigma^2_{t-1}$.
- **Belirsizlik Bandı:** $\pm \max(1, \text{round}(1.5 \cdot \sigma))$.

### [P4] Aykırı Değer Filtresi
- **Koşul:** Döngü uzunluğu $< 18$ gün veya $> 2 \times \text{medyan}(L)$.
- **Davranış:** Tahmin modeline dahil edilmez. Arayüzde "Eksik veya hatalı giriş olabilir mi?" bildirimi üretilir.

### [P5] Düzenlilik Sınıflandırması
- **Koşul:** $\sigma < 1.5$ gün $\to$ "Yüksek Düzenlilik".
- $\sigma \ge 1.5$ gün $\to$ "Değişken / Geniş Olasılık Bandı" (takvimde kesikli çizgi).

### [P6] Bireysel Luteal Faz ile Ovülasyon Geri Sayımı
- **Koşul:** Kullanıcının semptotermal olarak doğrulanmış en az 3 döngülük luteal faz ortalaması ($LP_{\text{avg}}$) mevcutsa.
- **Tahmini Ovülasyon:** $\text{Döngü Başlangıcı} + \hat{L} - LP_{\text{avg}}$.

### [P7] Knaus-Ogino Takvim Referansı (Bilgi Amaçlı)
- **Koşul:** En az 6 tamamlanmış döngü.
- **Pencere:** $\min(L) - 18$ ile $\max(L) - 11$.
- **Zorunlu Kural:** Arayüzde kesinlikle "güvenli gün" olarak adlandırılamaz; koruma amaçlı kullanılamayacağı açıkça belirtilir.

---

## 2. İleri Mod: Sensiplan Semptotermal Kuralları

### [T1] Kaplama Çizgisi (Coverline) Tespiti
- Potansiyel termal sıçramadan önceki **kesintisiz 6 geçerli (bozulmamış / excluded olmayan)** düşük ölçümün en yükseği:
  $$T_{\text{cover}} = \max(T_{n-5}, \dots, T_n)$$

### [T2] Temel Sıcaklık Kuralı (3 Yüksek Ölçüm)
- Ardışık 3 ölçüm kaplama çizgisinin üzerinde olmalıdır:
  $$T_{n+1} > T_{\text{cover}}, \quad T_{n+2} > T_{\text{cover}}, \quad T_{n+3} \ge T_{\text{cover}} + 0.2\,^\circ\text{C}$$

### [T3] Sıcaklık İstisna Kuralı 1
- Eğer 3. ölçüm kaplama çizgisinin üstünde kalıp $+0.2\,^\circ\text{C}$ farkını sağlayamazsa, 4. gün ölçümü beklenir.
- 4. gün ölçümünün kaplama çizgisinin üzerinde olması yeterlidir ($+0.2\,^\circ\text{C}$ aranmaz).

### [T4] Sıcaklık İstisna Kuralı 2
- 2. veya 3. yüksek ölçüm sırasında sıcaklık kaplama çizgisine veya altına düşerse, bu düşüş günü atlanır.
- Kaplama çizgisinin en az $+0.2\,^\circ\text{C}$ üzerinde ek bir ölçüm beklenir.

### [T5] İstisna Birleştirme Yasağı
- İstisna 1 ve İstisna 2 kuralları **aynı döngü içinde kesinlikle birlikte uygulanamaz**.

### [T6] Bozucu Etken ve Ölçüm İptali
- Alkol, hastalık/ateş, yetersiz uyku, geç ölçüm gibi etkenler işaretlendiğinde ölçüm paranteze alınır (`excluded: true`) ve $T_{\text{cover}}$ veya yüksek ölçüm dizisine katılmaz.

---

## 3. Mukus Değerlendirmesi

### [M1] Mukus Kategorisi Türetimi
- His (kuru, yok, nemli, ıslak) ve Görünüm (yok, kalın/krem, şeffaf, uzayan) ikilisinden Sensiplan kategorisi türetilir:
  - $\emptyset$ / $t$ : Kuru veya hissedilmeyen.
  - $f$ / $m$ : Nemli, kremsi veya yapışkan.
  - $S$ / $S+$ : Şeffaf, cam gibi, uzayan, yoğun ıslak/kaygan his.

### [M2] Zirve Günü ve 3 Gün Düşüş Kuralı
- Gözlemlenen en kaliteli mukusun son günü "Mukus Zirve Günü" (Peak Day) olarak işaretlenir.
- Zirve gününü takip eden ardışık 3 gün boyunca mukus kalitesinde belirgin gerileme ($t$, $\emptyset$ veya belirgin düşüş) doğrulanmalıdır. 3. günün akşamı mukus kuralı tamamlanır.

---

## 4. Çift Kontrol ve Faz Geçişleri

### [D1] Post-Ovülatuar Kısır Dönemin Açılışı
- Doğurganlık penceresinin kapanması ve luteal kısır dönemin başlaması:
  $$\text{Kapanış Zamanı} = \max(\text{Sıcaklık Doğrulaması Akşamı}, \text{Mukus Doğrulaması Akşamı})$$
- Her iki kriter de sağlanana kadar doğurganlık durumu "fertile" (doğurgan) olarak korunur.

### [E1] Döngü Başı (Pre-ovülatuar) İlk 5 Gün Kuralı
- Önceki döngüde ovülasyon doğrulanmışsa, yeni döngünün ilk 5 günü kısır kabul edilir.

### [E2] Eksi-8 Kuralı
- Geçmişte en az 12 kayıtlı döngü olduğunda:
  $$\text{Son Kısır Gün} = \min_{1 \le i \le 12}(1\text{HM}_i) - 8$$
  ($1\text{HM}$: İlk yüksek sıcaklık ölçüm günü).

### [E3] Eksi-20 Kuralı
- Eksi-8 uygulanamıyorsa ve en az 12 döngü varsa:
  $$\text{Son Kısır Gün} = \min_{1 \le i \le 12}(L_i) - 20$$

### [E4] Mukus Acil Kesme Kuralı
- Tarihsel hesaplama (E1, E2, E3) ne söylerse söylesin, döngünün herhangi bir gününde nem veya mukus gözlemlendiği anda pre-ovülatuar kısır dönem derhal sonlanır.

### [X1] Güvenli Varsayılan İlkesi
- Herhangi bir eksik ölçüm, çelişki veya belirsizlik durumunda sistem daima **"fertile / doğurgan"** statüsüne düşer.
