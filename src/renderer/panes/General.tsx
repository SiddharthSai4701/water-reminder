import { DEFAULT_CONFIG } from '../../core/config.js';
import type { Config } from '../../shared/types.js';

interface Props {
  config: Config;
  patch: (partial: Partial<Config>) => Promise<void>;
}

export default function GeneralPane({ config, patch }: Props): JSX.Element {
  function resetToDefaults(): void {
    if (!window.confirm('Reset every setting back to its default? This cannot be undone.')) return;
    // nextDueAt and dndUntil are live state, not preferences. Resetting
    // nextDueAt would re-arm the schedule from nowhere, and clearing
    // dndUntil would silently cancel a pause the user is relying on.
    const { nextDueAt: _nextDueAt, dndUntil: _dndUntil, ...preferences } = DEFAULT_CONFIG;
    void patch(preferences);
  }

  return (
    <div className="pane">
      <label>
        <input
          type="checkbox"
          checked={config.autostart}
          onChange={(e) => void patch({ autostart: e.currentTarget.checked })}
        />
        Start Water Reminder when I log in
      </label>

      <div className="row">
        <button type="button" className="danger" onClick={resetToDefaults}>
          Reset to defaults
        </button>
        <span className="note">Your drink history is kept; only settings are reset.</span>
      </div>
    </div>
  );
}
