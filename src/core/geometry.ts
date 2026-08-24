import type { CornerPosition, WindowMode } from '../shared/types.js';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const CORNER_SIZE = { width: 340, height: 150 } as const;
export const CENTER_SIZE = { width: 520, height: 320 } as const;
export const CORNER_MARGIN = 24;

export function popupBounds(
  mode: WindowMode,
  workArea: Rect,
  corner: CornerPosition,
): Rect {
  if (mode === 'fullscreen') {
    return { ...workArea };
  }

  if (mode === 'center') {
    return {
      x: Math.max(workArea.x, workArea.x + Math.round((workArea.width - CENTER_SIZE.width) / 2)),
      y: Math.max(workArea.y, workArea.y + Math.round((workArea.height - CENTER_SIZE.height) / 2)),
      width: CENTER_SIZE.width,
      height: CENTER_SIZE.height,
    };
  }

  const right = workArea.x + workArea.width - CORNER_SIZE.width - CORNER_MARGIN;
  const bottom = workArea.y + workArea.height - CORNER_SIZE.height - CORNER_MARGIN;
  const left = workArea.x + CORNER_MARGIN;
  const top = workArea.y + CORNER_MARGIN;

  const x = corner === 'top-left' || corner === 'bottom-left' ? left : right;
  const y = corner === 'top-left' || corner === 'top-right' ? top : bottom;

  return {
    x: Math.max(workArea.x, x),
    y: Math.max(workArea.y, y),
    width: CORNER_SIZE.width,
    height: CORNER_SIZE.height,
  };
}
