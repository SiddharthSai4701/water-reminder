import { CORNERS } from '../../core/config.js';
import { PRESET_LADDERS, validateLadder } from '../../core/ladder.js';
import { stageOffsets } from '../../core/scheduler.js';
import type {
  Config,
  CornerPosition,
  Ladder,
  PresetName,
  Stage,
  WindowMode,
} from '../../shared/types.js';
import { fieldKey, numberBlur, useFieldRevision } from './numberField.js';

/** The presets that are cards. 'custom' is a state, not a choice. */
type Preset = Exclude<PresetName, 'custom'>;

const MINUTE_MS = 60_000;

const PRESET_CARDS: Preset[] = ['gentle', 'nudge', 'standard', 'relentless'];

const PRESET_LABELS: Record<Preset, string> = {
  gentle: 'Gentle',
  nudge: 'Nudge',
  standard: 'Standard',
  relentless: 'Relentless',
};

const PRESET_BLURBS: Record<Preset, string> = {
  gentle: 'A corner card, and that is all.',
  nudge: 'Moves to the middle of the screen if you leave it.',
  standard: 'Ends up filling the screen.',
  relentless: 'Fills the screen quickly, with sound.',
};

const MODE_LABELS: Record<WindowMode, string> = {
  corner: 'Corner card',
  center: 'Centre of the screen',
  fullscreen: 'Full screen',
};

const CORNER_LABELS: Record<CornerPosition, string> = {
  'top-left': 'Top left',
  'top-right': 'Top right',
  'bottom-left': 'Bottom left',
  'bottom-right': 'Bottom right',
};

interface Props {
  config: Config;
  patch: (partial: Partial<Config>) => Promise<void>;
}

/** "3m" from 180000, without the trailing .00 whole minutes would carry. */
function minutesLabel(ms: number): string {
  return `${Number((ms / MINUTE_MS).toFixed(2))}m`;
}

/**
 * A ladder written as the times it actually fires at: standard is
 * "0m → 3m → 8m", not the 0/3/5 gaps stored in it. stageOffsets is the
 * scheduler's own running total, so the card cannot drift from the behaviour.
 */
function absoluteTimes(ladder: Ladder): string {
  return stageOffsets(ladder).map(minutesLabel).join(' → ');
}

interface StageRowProps {
  index: number;
  stage: Stage;
  offsetMs: number;
  acceptDelay: (index: number, minutes: number) => boolean;
  setDelay: (index: number, minutes: number) => Promise<void>;
  setSound: (index: number, sound: boolean) => void;
}

/**
 * A stage is its own component so that its delay field gets its own remount
 * counter. useFieldRevision is one counter per field, and the number of fields
 * here changes with the ladder's length — which rules out calling it in a loop
 * in the pane, and rules out the shared counter that would remount a sibling
 * row and eat text somebody was mid-way through typing.
 */
function StageRow({
  index,
  stage,
  offsetMs,
  acceptDelay,
  setDelay,
  setSound,
}: StageRowProps): JSX.Element {
  const [revision, bump] = useFieldRevision();
  const first = index === 0;

  return (
    <div className="stage">
      <span className="stage-mode">{`${index + 1}. ${MODE_LABELS[stage.mode]}`}</span>

      <label className="stage-delay">
        {/* defaultValue + onBlur like every other number field in the window,
            and refused entries are put back by numberBlur's accept guard
            rather than by a min attribute the browser does not enforce on a
            typed value. */}
        <input
          key={fieldKey(stage.delayMinutes, revision)}
          type="number"
          min={first ? 0 : 1}
          disabled={first}
          defaultValue={stage.delayMinutes}
          onBlur={numberBlur(
            stage.delayMinutes,
            (v) => setDelay(index, v),
            bump,
            (v) => acceptDelay(index, v),
          )}
        />
        {first ? 'min — shows as soon as the reminder is due' : 'min after the stage above'}
      </label>

      <span className="stage-at">{`at ${minutesLabel(offsetMs)}`}</span>

      <label className="stage-sound">
        <input
          type="checkbox"
          checked={stage.sound === true}
          onChange={(e) => setSound(index, e.currentTarget.checked)}
        />
        Sound
      </label>
    </div>
  );
}

export default function EscalationPane({ config, patch }: Props): JSX.Element {
  const ladder = config.ladder;
  const offsets = stageOffsets(ladder);
  const custom = config.preset === 'custom';

  function withStage(index: number, next: Partial<Stage>): Ladder {
    return ladder.map((stage, i) => (i === index ? { ...stage, ...next } : { ...stage }));
  }

  /**
   * The gate that matters in this pane. normalizeConfig does not reject an
   * invalid ladder — it silently replaces it with the standard preset, so a
   * ladder validateLadder would fail does not come back as an error, it comes
   * back as somebody else's ladder with every stage the user configured gone
   * and nothing on screen to say why. Nothing here may write a ladder that
   * would not survive validateLadder, so every ladder write goes through here.
   */
  function writeLadder(next: Ladder): Promise<void> {
    if (validateLadder(next).length > 0) return Promise.resolve();
    return patch({ preset: 'custom', ladder: next });
  }

  const acceptDelay = (index: number, minutes: number): boolean =>
    validateLadder(withStage(index, { delayMinutes: minutes })).length === 0;

  const setDelay = (index: number, minutes: number): Promise<void> =>
    writeLadder(withStage(index, { delayMinutes: minutes }));

  const setSound = (index: number, sound: boolean): void => {
    void writeLadder(withStage(index, { sound }));
  };

  function choosePreset(preset: Preset): void {
    // Copied, not handed over: PRESET_LADDERS is module state the scheduler
    // reads too, and a preset array aliased into the config is one edit away
    // from being mutated for everybody.
    void patch({ preset, ladder: PRESET_LADDERS[preset].map((stage) => ({ ...stage })) });
  }

  return (
    <div className="pane">
      <fieldset className="presets">
        <legend>How hard it pushes</legend>
        {PRESET_CARDS.map((name) => (
          <button
            key={name}
            type="button"
            className="preset"
            aria-pressed={config.preset === name}
            onClick={() => choosePreset(name)}
          >
            <span className="preset-name">{PRESET_LABELS[name]}</span>
            {/* Absolute times, because "when does it go full screen" is the
                question being asked, not "how long after the last stage". */}
            <span className="preset-times">{absoluteTimes(PRESET_LADDERS[name])}</span>
            <span className="preset-blurb">{PRESET_BLURBS[name]}</span>
          </button>
        ))}
        {custom && (
          // No card is lit when the ladder is custom, which on its own looks
          // like the pane failed to load. Say it out loud instead.
          <p className="note">
            Your stages are custom, so no preset is highlighted. Choosing one replaces them.
          </p>
        )}
      </fieldset>

      <fieldset className="stages">
        <legend>Stages</legend>
        {ladder.map((stage, index) => (
          <StageRow
            key={index}
            index={index}
            stage={stage}
            offsetMs={offsets[index]}
            acceptDelay={acceptDelay}
            setDelay={setDelay}
            setSound={setSound}
          />
        ))}
        <p className="note">
          The first stage shows as soon as the reminder is due, so its delay stays at 0. Every later
          stage has to wait at least a minute — anything less is refused and the field snaps back.
        </p>
        <p className="note">Adding, removing or reordering stages is done by editing config.json.</p>
        <p className="note">Sound is stored per stage; playing it arrives in a later release.</p>
      </fieldset>

      <fieldset className="corners">
        <legend>Corner</legend>
        {CORNERS.map((corner) => (
          <label key={corner}>
            <input
              type="radio"
              name="cornerPosition"
              checked={config.cornerPosition === corner}
              onChange={() => void patch({ cornerPosition: corner })}
            />
            {CORNER_LABELS[corner]}
          </label>
        ))}
        <p className="note">Where the corner card sits before it escalates.</p>
      </fieldset>
    </div>
  );
}
