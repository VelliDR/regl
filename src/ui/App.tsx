import { useEffect, useState } from 'preact/hooks';
import { checkAndRequestStoragePersistence, StorageStatus } from '../data/persist';

export function App() {
  const [storageStatus, setStorageStatus] = useState<StorageStatus | null>(null);
  const [shareResult, setShareResult] = useState<string | null>(null);
  const [calendarResult, setCalendarResult] = useState<string | null>(null);

  useEffect(() => {
    checkAndRequestStoragePersistence().then((status) => {
      setStorageStatus(status);
    });
  }, []);

  const handleTestShare = async () => {
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        const dummyFile = new File(['{"version":1,"test":true}'], 'regl-yedek-test.json', {
          type: 'application/json',
        });
        if (navigator.canShare && navigator.canShare({ files: [dummyFile] })) {
          await navigator.share({
            title: 'Regl Yedekleme Testi',
            text: 'Çevrimdışı döngü takip yedekleme dosyası.',
            files: [dummyFile],
          });
          setShareResult('Web Share (dosya) başarılı ✅');
        } else {
          await navigator.share({
            title: 'Regl Yedekleme Testi',
            text: 'Çevrimdışı döngü takip yedekleme testi.',
          });
          setShareResult('Web Share (metin) başarılı ✅');
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setShareResult(`Hata: ${(err as Error).message}`);
        }
      }
    } else {
      setShareResult('Web Share API desteklenmiyor ❌');
    }
  };

  const handleTestCalendar = () => {
    try {
      // RFC 5545 formatında basit bir test .ics etkinliği
      const now = new Date();
      const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const dtStart = nextWeek.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
      const dtEnd = new Date(nextWeek.getTime() + 30 * 60 * 1000).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

      const icsData = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Regl App//TR',
        'BEGIN:VEVENT',
        `DTSTART:${dtStart}`,
        `DTEND:${dtEnd}`,
        'SUMMARY:Hatırlatıcı',
        'DESCRIPTION:Döngü takip hatırlatıcısı.',
        'BEGIN:VALARM',
        'TRIGGER:-PT15M',
        'ACTION:DISPLAY',
        'DESCRIPTION:Hatırlatıcı',
        'END:VALARM',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n');

      const blob = new Blob([icsData], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'hatirlatici-test.ics');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setCalendarResult('.ics takvim dosyası indirildi (Samsung Calendar ile açınız) ✅');
    } catch (err) {
      setCalendarResult(`Takvim hatası: ${(err as Error).message}`);
    }
  };

  return (
    <main style={{ padding: '24px 16px', maxWidth: '480px', margin: '0 auto', width: '100%' }}>
      <header style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px' }}>
          Regl & Semptotermal
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
          Faz 0 — Doğrulama ve İskelet Ekranı
        </p>
      </header>

      <section
        style={{
          backgroundColor: 'var(--bg-surface)',
          padding: '16px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)',
          marginBottom: '16px',
        }}
      >
        <h2 style={{ fontSize: '16px', marginBottom: '12px', color: 'var(--accent-primary)' }}>
          1. Kalıcı Depolama Durumu
        </h2>
        {storageStatus === null ? (
          <p style={{ color: 'var(--text-muted)' }}>Kontrol ediliyor...</p>
        ) : (
          <div style={{ fontSize: '14px', lineHeight: '1.6' }}>
            <p>
              Kalıcı Depolama (Persisted):{' '}
              <strong style={{ color: storageStatus.isPersisted ? 'var(--fertile-color)' : 'var(--accent-primary)' }}>
                {storageStatus.isPersisted ? 'AKTİF ✅ (Veriler silinmez)' : 'PASİF ⚠️ (Tarayıcı temizleyebilir)'}
              </strong>
            </p>
            {storageStatus.quotaBytes && (
              <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                Ayrılan Kota: {(storageStatus.quotaBytes / (1024 * 1024)).toFixed(0)} MB
              </p>
            )}
          </div>
        )}
      </section>

      <section
        style={{
          backgroundColor: 'var(--bg-surface)',
          padding: '16px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)',
          marginBottom: '16px',
        }}
      >
        <h2 style={{ fontSize: '16px', marginBottom: '12px', color: 'var(--accent-primary)' }}>
          2. Cihaz Entegrasyon Testleri
        </h2>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button
            type="button"
            onClick={handleTestShare}
            style={{
              minHeight: 'var(--touch-target-min)',
              padding: '12px 16px',
              backgroundColor: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-strong)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            📤 Web Share (Drive / Telegram / Dosya) Test Et
          </button>
          {shareResult && (
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{shareResult}</p>
          )}

          <button
            type="button"
            onClick={handleTestCalendar}
            style={{
              minHeight: 'var(--touch-target-min)',
              padding: '12px 16px',
              backgroundColor: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-strong)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            📅 Takvim (.ics) Dışa Aktarımı Test Et
          </button>
          {calendarResult && (
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{calendarResult}</p>
          )}
        </div>
      </section>

      <footer style={{ marginTop: '32px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>
        <p>Sıfır Sunucu · Sıfır İzleyici · Tamamen Cihaz İçi</p>
      </footer>
    </main>
  );
}
