interface CycleRingProps {
  readonly cycleDay?: number | undefined;
  readonly estimatedCycleLength: number;
  readonly daysUntilPeriod?: number | undefined;
  readonly isPeriodDueToday?: boolean | undefined;
}

export function CycleRing({
  cycleDay,
  estimatedCycleLength,
  daysUntilPeriod,
  isPeriodDueToday,
}: CycleRingProps) {
  const size = 180;
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // Calculate percentage of cycle elapsed
  const progress = cycleDay ? Math.min(1, Math.max(0, cycleDay / estimatedCycleLength)) : 0;
  const strokeDashoffset = circumference - progress * circumference;

  let subtitle = 'Kayıt Başlatın';
  if (isPeriodDueToday) {
    subtitle = 'Bugün Bekleniyor';
  } else if (daysUntilPeriod !== undefined) {
    if (daysUntilPeriod > 0) {
      subtitle = `${daysUntilPeriod} gün sonra`;
    } else {
      subtitle = `${Math.abs(daysUntilPeriod)} gün gecikti`;
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '12px auto',
        position: 'relative',
        width: `${size}px`,
        height: `${size}px`,
      }}
    >
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--bg-elevated)"
          strokeWidth={strokeWidth}
        />
        {/* Active progress arc */}
        {cycleDay && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--accent-primary)"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.5s ease' }}
          />
        )}
      </svg>

      {/* Center text badge */}
      <div
        style={{
          position: 'absolute',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
        }}
      >
        <span style={{ fontSize: '28px', fontWeight: '800', color: 'var(--text-primary)', lineHeight: 1.1 }}>
          {cycleDay ? `${cycleDay}. Gün` : '—'}
        </span>
        <span style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
          {subtitle}
        </span>
      </div>
    </div>
  );
}
