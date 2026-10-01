/**
 * Label placement for the graph window: keeps labels from overlapping by
 * skipping any label whose box would cover one already drawn this frame.
 * Nodes are drawn most-connected first, so the important labels win; the
 * rest appear when zooming in. Pure, so it is unit-tested without a canvas.
 */

export interface Box {
  x: number; // left
  y: number; // top
  w: number;
  h: number;
}

export function overlaps(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  );
}

/** Boxes of the labels drawn in the current frame. */
export class LabelBoxes {
  private boxes: Box[] = [];

  reset(): void {
    this.boxes = [];
  }

  /** True when the box is free; it is then reserved. */
  claim(box: Box): boolean {
    if (this.boxes.some((b) => overlaps(b, box))) return false;
    this.boxes.push(box);
    return true;
  }

  /** Reserve a box regardless of overlap (hovered node, search hits). */
  force(box: Box): void {
    this.boxes.push(box);
  }
}

/** Estimated label width in graph units at zoom 1 (12px sans-serif). */
export function estimateLabelWidth(text: string): number {
  return Math.min(text.length, 40) * 6.5;
}
