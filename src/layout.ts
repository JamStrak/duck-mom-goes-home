// 屏幕/画布布局：把矩形网格适配到可用区域，格子保持正方形。

export interface ViewLayout {
  cols: number;
  rows: number;
  /** 正方形格边距（px，CSS 像素） */
  cell: number;
  originX: number;
  originY: number;
  w: number;
  h: number;
}

export const MIN_CELL = 44;
export const MAX_CELL = 72;

/** 计算居中布局。目标设备保证 ≥44px；极小屏允许降到 30px 而非溢出。 */
export function computeGridLayout(
  cols: number,
  rows: number,
  areaW: number,
  areaH: number,
): ViewLayout {
  let cell = Math.min(areaW / cols, areaH / rows);
  cell = Math.min(cell, MAX_CELL);
  if (cell < MIN_CELL) cell = Math.max(30, cell);
  const w = cell * cols;
  const h = cell * rows;
  return {
    cols,
    rows,
    cell,
    originX: (areaW - w) / 2,
    originY: (areaH - h) / 2,
    w,
    h,
  };
}
