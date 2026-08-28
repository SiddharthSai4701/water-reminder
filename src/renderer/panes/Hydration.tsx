import type { Config } from '../../shared/types.js';
import { fieldKey, numberBlur, useFieldRevision } from './numberField.js';

interface Props {
  config: Config;
  patch: (partial: Partial<Config>) => Promise<void>;
}

// Exact rather than rounded: a readout that disagrees with the ml field
// beside it reads as a bug. 4000 -> "4 L", 4250 -> "4.25 L".
function litres(ml: number): string {
  return `${(ml / 1000).toFixed(2).replace(/\.?0+$/, '')} L`;
}

export default function HydrationPane({ config, patch }: Props): JSX.Element {
  // One counter per field: see useFieldRevision on why these are not shared.
  const [goalRevision, bumpGoal] = useFieldRevision();
  const [glassRevision, bumpGlass] = useFieldRevision();
  // glassMl is clamped to 50..2000 by normalizeConfig, so it is never 0 here.
  const glasses = Math.ceil(config.goalMl / config.glassMl);

  return (
    <div className="pane">
      <label>
        Daily goal
        {/* defaultValue + onBlur, like the schedule's number inputs: a
            controlled value would be clamped on every keystroke and fight the
            user mid-type. The key remounts after every write that lands, so a
            clamp is visible immediately instead of diverging. */}
        <input
          key={fieldKey(config.goalMl, goalRevision)}
          type="number"
          min={250}
          max={10000}
          step={50}
          defaultValue={config.goalMl}
          onBlur={numberBlur(config.goalMl, (v) => patch({ goalMl: v }), bumpGoal)}
        />
        ml
        <span className="note">{litres(config.goalMl)}</span>
      </label>

      <label>
        A glass is
        <input
          key={fieldKey(config.glassMl, glassRevision)}
          type="number"
          min={50}
          max={2000}
          step={10}
          defaultValue={config.glassMl}
          onBlur={numberBlur(config.glassMl, (v) => patch({ glassMl: v }), bumpGlass)}
        />
        ml
      </label>

      <p className="note">{`That is ${glasses} glasses a day.`}</p>
    </div>
  );
}
