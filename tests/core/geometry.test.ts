import { describe, it, expect } from 'vitest';
import {
  CENTER_SIZE,
  CORNER_MARGIN,
  CORNER_SIZE,
  popupBounds,
  type Rect,
} from '../../src/core/geometry.js';

// A 1920x1080 display whose work area starts 40px down (menu bar / taskbar).
const workArea: Rect = { x: 0, y: 40, width: 1920, height: 1000 };

describe('popupBounds', () => {
  it('places a corner popup bottom-right by default margins', () => {
    const b = popupBounds('corner', workArea, 'bottom-right');
    expect(b.width).toBe(CORNER_SIZE.width);
    expect(b.height).toBe(CORNER_SIZE.height);
    expect(b.x).toBe(1920 - CORNER_SIZE.width - CORNER_MARGIN);
    expect(b.y).toBe(40 + 1000 - CORNER_SIZE.height - CORNER_MARGIN);
  });

  it('places a corner popup top-left inside the work area', () => {
    const b = popupBounds('corner', workArea, 'top-left');
    expect(b.x).toBe(CORNER_MARGIN);
    expect(b.y).toBe(40 + CORNER_MARGIN);
  });

  it('places a corner popup top-right', () => {
    const b = popupBounds('corner', workArea, 'top-right');
    expect(b.x).toBe(1920 - CORNER_SIZE.width - CORNER_MARGIN);
    expect(b.y).toBe(40 + CORNER_MARGIN);
  });

  it('places a corner popup bottom-left', () => {
    const b = popupBounds('corner', workArea, 'bottom-left');
    expect(b.x).toBe(CORNER_MARGIN);
    expect(b.y).toBe(40 + 1000 - CORNER_SIZE.height - CORNER_MARGIN);
  });

  it('centers a center popup in the work area', () => {
    const b = popupBounds('center', workArea, 'bottom-right');
    expect(b.width).toBe(CENTER_SIZE.width);
    expect(b.height).toBe(CENTER_SIZE.height);
    expect(b.x).toBe(Math.round((1920 - CENTER_SIZE.width) / 2));
    expect(b.y).toBe(40 + Math.round((1000 - CENTER_SIZE.height) / 2));
  });

  it('fills the whole work area for fullscreen', () => {
    expect(popupBounds('fullscreen', workArea, 'bottom-right')).toEqual(workArea);
  });

  it('keeps every edge inside a work area smaller than the popup', () => {
    const tiny: Rect = { x: 0, y: 0, width: 300, height: 200 };
    for (const mode of ['corner', 'center'] as const) {
      const b = popupBounds(mode, tiny, 'bottom-right');
      expect(b.x).toBeGreaterThanOrEqual(tiny.x);
      expect(b.y).toBeGreaterThanOrEqual(tiny.y);
      expect(b.x + b.width).toBeLessThanOrEqual(tiny.x + tiny.width);
      expect(b.y + b.height).toBeLessThanOrEqual(tiny.y + tiny.height);
    }
  });

  it('returns a copy for fullscreen rather than aliasing the work area', () => {
    const area: Rect = { x: 0, y: 40, width: 1920, height: 1000 };
    const b = popupBounds('fullscreen', area, 'bottom-right');
    expect(b).not.toBe(area);
    b.width = 1;
    expect(area.width).toBe(1920);
  });
});
