/**
 * Keeps FC’s outer `.fc-event` visually minimal so the layered card renders
 * inside `eventContent` without double backgrounds or chunky borders — drag /
 * resize handles keep working against the `.fc-event` root.
 */
export function paintFcEventElement(el: HTMLElement): void {
  el.style.backgroundColor = 'transparent';
  el.style.border = 'none';
  el.style.boxShadow = 'none';
}
