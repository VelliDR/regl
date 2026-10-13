export const STRINGS = {
  appName: "Regl & Semptotermal",
  tagline: "Çevrimdışı, Mahrem ve Bilimsel Döngü Takibi",

  nav: {
    today: "Bugün",
    calendar: "Takvim",
    chart: "Grafik",
    insights: "İçgörüler",
    settings: "Ayarlar",
  },

  today: {
    cycleDay: (day: number) => `Döngü Günü ${day}`,
    noActiveCycle: "Kayıtlı aktif döngü yok",
    startCyclePrompt: "Döngü başlatmak için kanama girin",
    predictedPeriodIn: (days: number) => `Tahmini regl: ${days} gün sonra`,
    periodDueToday: "Tahmini regl günü bugün",
    periodOverdue: (days: number) => `Tahmini regl ${days} gün geçti`,
    bleeding: "Kanama Yoğunluğu",
    bbt: "Bazal Vücut Isısı (BBT)",
    mucus: "Servikal Mukus",
    disturbances: "Bozucu Etkenler",
    symptoms: "Fiziksel Belirtiler",
    mood: "Duygudurum & Enerji",
    sex: "Cinsel Aktivite",
    notes: "Kişisel Not",
    saved: "Kaydedildi",
  },

  bleeding: {
    none: "Yok",
    spotting: "Leke (Spotting)",
    light: "Hafif",
    medium: "Orta",
    heavy: "Yoğun",
  },

  mucusSensation: {
    dry: "Kuru",
    nothing: "Hissiyat Yok",
    moist: "Nemli",
    wet: "Islak / Kaygan",
  },

  mucusAppearance: {
    none: "Yok",
    thick: "Krem / Beyaz",
    creamy: "Yapışkan",
    clear: "Şeffaf / Su Gibi",
    stretchy: "Yumurta Akı (Uzayan)",
  },

  disturbances: {
    alcohol: "Alkol",
    illness: "Hastalık / Ateş",
    badSleep: "Kötü Uyku",
    lateMeasure: "Geç Ölçüm",
    medication: "İlaç Kullanımı",
    travel: "Seyahat / Stres",
  },

  symptoms: {
    cramps: "Kramplar / Kasık Ağrısı",
    breast: "Göğüs Hassasiyeti",
    headache: "Baş Ağrısı",
    bloating: "Şişkinlik",
    backache: "Bel Ağrısı",
    acne: "Cilt / Akne",
  },

  mood: {
    calm: "Sakin",
    happy: "Mutlu / Keyifli",
    anxious: "Endişeli / Gergin",
    sad: "Duygusal / Hüzünlü",
    tired: "Yorgun",
    energetic: "Enerjik",
  },

  sex: {
    none: "Yok",
    protected: "Korunmalı",
    unprotected: "Korunmasız",
  },

  settings: {
    title: "Ayarlar ve Veri Güvenliği",
    trackingMode: "Takip Modu",
    basicMode: "Temel Mod (Sadece Kanama ve Tahmin)",
    symptothermalMode: "İleri Seviye Semptotermal (BBT + Mukus)",
    defaultCycleLength: "Varsayılan Döngü Süresi",
    storageSection: "Cihaz İçi Depolama",
    storagePersisted: "Kalıcı Depolama: Aktif ✅ (Veriler silinmez)",
    storageNotPersisted: "Kalıcı Depolama: Pasif ⚠️ (Tarayıcı temizleyebilir)",
    backupSection: "Yedekleme ve Veri Egemenliği",
    exportJson: "Yedek İndir / Paylaş (JSON)",
    exportCsv: "Tablo Olarak İndir (CSV / Hekim Raporu)",
    importBackup: "Yedekten Geri Yükle",
    theme: "Görünüm / Tema",
    lockSection: "Uygulama Kilidi ve Kasa Güvenliği (PIN / Parola)",
    lockActive: "Uygulama Kilidi: Aktif 🔒",
    lockInactive: "Uygulama Kilidi: Pasif 🔓",
    lockNow: "Uygulamayı Şimdi Kilitle 🔒",
    setPassphrase: "PIN veya Parola Belirle",
    removePassphrase: "Kilidi Kaldır",
    passphrasePlaceholder: "En az 4 karakter",
    lockSaved: "Uygulama kilidi başarıyla etkinleştirildi ✅",
    lockRemoved: "Uygulama kilidi kaldırıldı 🔓",
    wizardRerun: "Kurulum Sihirbazını Yeniden Başlat 🌸",
    educationSection: "Bilimsel Rehberler ve Kitaplar",
    sensiplanGuideTitle: "Sensiplan Resmi Metodoloji Kılavuzu",
    sensiplanGuideDesc:
      "Alman NFP çalışma grubunun klinik çift-kontrol kuralları ve kaynakları.",
    disclaimer:
      "Bu yazılım tıbbi bir cihaz veya hekim tavsiyesi değildir. Yalnızca kişisel döngü farkındalığı amacıyla tasarlanmıştır.",
  },
} as const;
