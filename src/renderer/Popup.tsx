import { useEffect, useState } from 'react';
import type { PopupPayload } from '../shared/types.js';

const SNOOZE_CHOICES = [5, 10, 15, 30];

function Ring({ pct }: { pct: number }): JSX.Element {
  const clamped = Math.max(0, Math.min(100, pct));
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg className="ring" width="56" height="56" viewBox="0 0 56 56">
      <circle cx="28" cy="28" r={radius} fill="none" stroke="rgba(234,246,251,0.18)" strokeWidth="5" />
      <circle
        cx="28"
        cy="28"
        r={radius}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - clamped / 100)}
        transform="rotate(-90 28 28)"
      />
      <text x="28" y="32" textAnchor="middle">{`${clamped}%`}</text>
    </svg>
  );
}

export default function Popup(): JSX.Element {
  const [payload, setPayload] = useState<PopupPayload | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    window.water.onShow((next) => {
      setPayload(next);
      setMenuOpen(false);
    });
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (payload === null) return;
      if (event.key === 'Enter') window.water.drank();
      else if (event.key.toLowerCase() === 's') window.water.snooze(payload.defaultSnoozeMinutes);
      else if (event.key === 'Escape') window.water.skip();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [payload]);

  if (payload === null) return <div className="shell" />;

  return (
    <div className={`shell ${payload.mode}`}>
      <div className="card">
        <Ring pct={payload.goalPct} />
        {/* Siblings, not nested: the corner card line-clamps .line, which
            would otherwise clip the glass count along with the message. */}
        <div className="line">{payload.line}</div>
        <div className="meta">{`${payload.glasses} glasses today`}</div>
        <div className="actions">
          <button className="primary" onClick={() => window.water.drank()}>
            Drank it
          </button>
          <div className="snooze-wrap">
            <button onClick={() => setMenuOpen((open) => !open)}>
              {`Snooze ${payload.defaultSnoozeMinutes}m ▾`}
            </button>
            {menuOpen && (
              <div className="snooze-menu">
                {SNOOZE_CHOICES.map((minutes) => (
                  <button key={minutes} onClick={() => window.water.snooze(minutes)}>
                    {`${minutes} minutes`}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="ghost" title="Skip" onClick={() => window.water.skip()}>
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
