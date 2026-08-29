export type WindowMode = 'corner' | 'center' | 'fullscreen';

export interface Stage {
  mode: WindowMode;
  /** Minutes after the previous stage. The first stage is always 0. */
  delayMinutes: number;
  /** Play the configured sound when this stage is entered. */
  sound?: boolean;
}

export type Ladder = Stage[];

export type PresetName = 'gentle' | 'nudge' | 'standard' | 'relentless' | 'custom';

export type CornerPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface Schedule {
  intervalMinutes: number;
  /** Minutes from local midnight, e.g. 9 * 60 for 09:00. */
  workStartMinute: number;
  workEndMinute: number;
  /** Day indices, 0 = Sunday .. 6 = Saturday. */
  workDays: number[];
}

export interface Config {
  version: number;
  schedule: Schedule;
  preset: PresetName;
  ladder: Ladder;
  defaultSnoozeMinutes: number;
  goalMl: number;
  glassMl: number;
  cornerPosition: CornerPosition;
  activePackIds: string[];
  autostart: boolean;
  soundEnabled: boolean;
  /** Epoch ms until which reminders are paused, or null. */
  dndUntil: number | null;
  /** Epoch ms of the next reminder, persisted so a relaunch does not re-arm. */
  nextDueAt: number | null;
}

export type LogEventType = 'drank' | 'skip' | 'snooze';

export interface LogEvent {
  ts: number;
  type: LogEventType;
  ml?: number;
  minutes?: number;
}

export interface PackLine {
  text: string;
  /** Ladder stage indices this line suits. Absent means every stage. */
  stage?: number[];
}

export interface Pack {
  id: string;
  name: string;
  lines: PackLine[];
}

/** Everything the popup renderer needs to draw itself. */
export interface PopupPayload {
  line: string;
  stageIndex: number;
  mode: WindowMode;
  glasses: number;
  goalPct: number;
  defaultSnoozeMinutes: number;
}

export interface PackSummary {
  id: string;
  name: string;
  lineCount: number;
  active: boolean;
  /** A user file exists for this id. Shipped packs start false. */
  customised: boolean;
  /**
   * The app ships a pack with this id. False means the user file is the only
   * copy there is, so deleting it is not a revert — there is nothing under it.
   */
  shipped: boolean;
  /** Present when the file failed to load; the pane shows it verbatim. */
  error?: string;
}

export type PackWriteResult =
  | { ok: true; packs: PackSummary[] }
  | { ok: false; errors: { line?: number; message: string }[] };
