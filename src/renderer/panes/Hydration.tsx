import type { Config } from '../../shared/types.js';
import { numberBlur } from './numberField.js';

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
  // glassMl is clamped to 50..2000 by normalizeConfig, so it is never 0 here.
  const glasses = Math.ceil(config.goalMl / config.glassMl);

  return (
    <div className="pane">
      <label>
        Daily goal
        {/* defaultValue + onBlur, like the schedule's number inputs: a
            controlled value would be clamped on every keystroke and fight the
            user mid-type. The key remounts on a change to the stored value, so
            a clamp is visible immediately instead of diverging. */}
        <input
          key={config.goalMl}
          type="number"
          min={250}
          max={10000}
          step={50}
          defaultValue={config.goalMl}
          onBlur={numberBlur(config.goalMl, (v) => void patch({ goalMl: v }))}
        />
        ml
        <span className="note">{litres(config.goalMl)}</span>
      </label>

      <label>
        A glass is
        <input
          key={config.glassMl}
          type="number"
          min={50}
          max={2000}
          step={10}
          defaultValue={config.glassMl}
          onBlur={numberBlur(config.glassMl, (v) => void patch({ glassMl: v }))}
        />
        ml
      </label>

      <p className="note">{`That is ${glasses} glasses a day.`}</p>
    </div>
  );
}
