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
  customLines: string[];
  autostart: boolean;
  soundEnabled: boolean;
  /** Epoch ms until which reminders are paused, or null. */
  dndUntil: number | null;
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
