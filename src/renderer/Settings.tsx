import { useEffect, useState } from 'react';
import type { Config, PackSummary } from '../shared/types.js';
import EscalationPane from './panes/Escalation.js';
import GeneralPane from './panes/General.js';
import HydrationPane from './panes/Hydration.js';
import PacksPane from './panes/Packs.js';
import SchedulePane from './panes/Schedule.js';

const PANES = ['Schedule', 'Escalation', 'Hydration', 'Packs', 'General'] as const;
type Pane = (typeof PANES)[number];

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function Settings(): JSX.Element {
  const [pane, setPane] = useState<Pane>('Schedule');
  const [config, setConfig] = useState<Config | null>(null);
  const [packs, setPacks] = useState<PackSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.waterSettings
      .get()
      .then((state) => {
        setConfig(state.config);
        setPacks(state.packs);
      })
      // Without this the window sits on "Loading…" for ever and looks hung,
      // with the reason only in a devtools console nobody opens.
      .catch((err: unknown) => setError(`Could not load your settings: ${describe(err)}`));
    return window.waterSettings.onChanged(setConfig);
  }, []);

  async function patch(partial: Partial<Config>): Promise<void> {
    try {
      // The main process is the source of truth: what comes back is the
      // normalized config, so a clamped value shows up rather than diverging.
      setConfig(await window.waterSettings.patch(partial));
      setError(null);
    } catch (err: unknown) {
      // There is no Save button, so a rejected patch is the only signal the
      // user gets that the change did not stick.
      setError(`Could not save that change: ${describe(err)}`);
    }
  }

  if (config === null) {
    return <div className={error === null ? 'loading' : 'loading error'}>{error ?? 'Loading…'}</div>;
  }

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
        {error !== null && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {pane === 'Schedule' && <SchedulePane config={config} patch={patch} />}
        {pane === 'Escalation' && <EscalationPane config={config} patch={patch} />}
        {pane === 'Hydration' && <HydrationPane config={config} patch={patch} />}
        {pane === 'Packs' && (
          <PacksPane config={config} packs={packs} setPacks={setPacks} patch={patch} />
        )}
        {pane === 'General' && <GeneralPane config={config} patch={patch} />}
      </main>
    </div>
  );
}
