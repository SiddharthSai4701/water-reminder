import type { CornerPosition, WindowMode } from '../shared/types.js';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Sized to fit the stacked content without clipping: ring 40 + message 43
// (two lines) + meta 16 + buttons 36 + gaps 36, inside the card's 32px of
// padding and the shell's 16px, is 219. Width is driven by the three
// buttons needing ~226px side by side.
export const CORNER_SIZE = { width: 380, height: 240 } as const;
export const CENTER_SIZE = { width: 520, height: 320 } as const;
export const CORNER_MARGIN = 24;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function popupBounds(
  mode: WindowMode,
  workArea: Rect,
  displayBounds: Rect,
  corner: CornerPosition,
): Rect {
  if (mode === 'fullscreen') {
    return { ...displayBounds };
  }

  // Size is clamped before position. Clamping only x and y would keep the
  // popup's top-left corner on screen while its right and bottom edges hung
  // off it — a guard on two edges and silence on the other two.
  const preferred = mode === 'center' ? CENTER_SIZE : CORNER_SIZE;
  const width = Math.min(preferred.width, workArea.width);
  const height = Math.min(preferred.height, workArea.height);

  const minX = workArea.x;
  const maxX = workArea.x + workArea.width - width;
  const minY = workArea.y;
  const maxY = workArea.y + workArea.height - height;

  if (mode === 'center') {
    return {
      x: clamp(workArea.x + Math.round((workArea.width - width) / 2), minX, maxX),
      y: clamp(workArea.y + Math.round((workArea.height - height) / 2), minY, maxY),
      width,
      height,
    };
  }

  const right = workArea.x + workArea.width - width - CORNER_MARGIN;
  const bottom = workArea.y + workArea.height - height - CORNER_MARGIN;
  const left = workArea.x + CORNER_MARGIN;
  const top = workArea.y + CORNER_MARGIN;

  const x = corner === 'top-left' || corner === 'bottom-left' ? left : right;
  const y = corner === 'top-left' || corner === 'top-right' ? top : bottom;

  return {
    x: clamp(x, minX, maxX),
    y: clamp(y, minY, maxY),
    width,
    height,
  };
}
