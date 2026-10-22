/**
 * Index math for the onboarding pager.
 *
 * The scroll view is forced to `direction: 'ltr'`, so content offsets are always *visual*
 * left-to-right coordinates on every platform. In RTL the slides are rendered in reverse visual
 * order (slide 0 at the far right) so the user swipes in the reading direction.
 *   logical index  — which story slide (0 = "Learn")
 *   visual slot    — position inside the scroll content (0 = leftmost)
 */

export function clampIndex(i: number, pages: number): number {
  'worklet';
  return Math.min(pages - 1, Math.max(0, i));
}

/** Visual slot of a logical slide (an involution: also maps slot → logical). */
export function slotOf(logical: number, pages: number, rtl: boolean): number {
  'worklet';
  return rtl ? pages - 1 - logical : logical;
}

/** Visual slide order to render inside the scroll content. */
export function visualOrder(pages: number, rtl: boolean): number[] {
  return Array.from({ length: pages }, (_, slot) => slotOf(slot, pages, rtl));
}

/** Fractional logical position (0…pages-1) for a visual content offset. */
export function logicalProgress(offsetX: number, width: number, pages: number, rtl: boolean): number {
  'worklet';
  const visual = width > 0 ? offsetX / width : 0;
  return rtl ? pages - 1 - visual : visual;
}

/** Content offset that shows a logical slide. */
export function offsetFor(logical: number, width: number, pages: number, rtl: boolean): number {
  'worklet';
  return slotOf(clampIndex(logical, pages), pages, rtl) * width;
}
