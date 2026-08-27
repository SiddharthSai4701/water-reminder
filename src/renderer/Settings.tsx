import { useEffect, useState } from 'react';
import type { Config, PackSummary } from '../shared/types.js';

const PANES = ['Schedule', 'Escalation', 'Hydration', 'Packs', 'General'] as const;
type Pane = (typeof PANES)[number];

export default function Settings(): JSX.Element {
  const [pane, setPane] = useState<Pane>('Schedule');
  const [config, setConfig] = useState<Config | null>(null);
  const [packs, setPacks] = useState<PackSummary[]>([]);

  useEffect(() => {
    void window.waterSettings.get().then((state) => {
      setConfig(state.config);
      setPacks(state.packs);
    });
    return window.waterSettings.onChanged(setConfig);
  }, []);

  async function patch(partial: Partial<Config>): Promise<void> {
    setConfig(await window.waterSettings.patch(partial));
  }

  if (config === null) return <div className="loading">Loading…</div>;

  return (
    <div className="shell">
      <nav aria-label="Settings sections">
        {PANES.map((name) => (
          <button
            key={name}
            className={name === pane ? 'active' : ''}
            aria-current={name === pane ? 'page' : undefined}
            onClick={() => setPane(name)}
          >
            {name}
          </button>
        ))}
      </nav>
      <main>
        <h1>{pane}</h1>
        <p className="placeholder">
          {`${pane} settings arrive in a later task.`}
        </p>
        {/* patch and packs are wired up by Tasks 10-12. */}
        <span hidden>{`${packs.length} packs, goal ${config.goalMl}`}</span>
        <button hidden onClick={() => void patch({})} />
      </main>
    </div>
  );
}
