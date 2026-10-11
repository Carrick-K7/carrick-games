export interface CanvasViewportSample {
  mode: string | null;
  logicalWidth: number;
  logicalHeight: number;
  backingWidth: number;
  backingHeight: number;
  pixelRatio: number;
  cssWidth: number;
  cssHeight: number;
  offsetX: number;
  offsetY: number;
  viewportWidth: number;
  viewportHeight: number;
  devicePixelRatio: number;
}

/** Independent assertions for the SDK's public contain/responsive canvas contract. */
export function canvasViewportIssues(
  sample: CanvasViewportSample,
  fixedSize: { width: number; height: number },
  legacyContainedResize = false,
): string[] {
  const issues: string[] = [];
  if (sample.mode !== 'responsive') {
    // API-1 fixed releases may predate the optional viewport-mode marker.
    if (sample.mode !== null && sample.mode !== 'contain') issues.push('unknown viewport mode');
    if (!legacyContainedResize && (sample.logicalWidth !== fixedSize.width || sample.logicalHeight !== fixedSize.height)) {
      issues.push(`fixed logical size ${sample.logicalWidth}x${sample.logicalHeight} != ${fixedSize.width}x${fixedSize.height}`);
    }
    return issues;
  }
  const { viewportWidth: width, viewportHeight: height } = sample;
  if (![width, height].every(value => Number.isFinite(value) && value > 0)) return ['invalid host viewport'];
  if (![sample.logicalWidth, sample.logicalHeight, sample.cssWidth, sample.cssHeight, sample.offsetX, sample.offsetY].every(Number.isFinite)) {
    return ['invalid responsive geometry'];
  }
  if (Math.abs(sample.logicalWidth - width) > 0.001 || Math.abs(sample.logicalHeight - height) > 0.001) {
    issues.push('responsive logical size must equal the host viewport');
  }
  if (Math.abs(sample.cssWidth - width) > 0.1 || Math.abs(sample.cssHeight - height) > 0.1
    || Math.abs(sample.offsetX) > 0.1 || Math.abs(sample.offsetY) > 0.1) {
    issues.push('responsive CSS canvas must fill the host viewport without an offset');
  }
  // Public SDK budget: uniform scale, DPR clamped to [1, 2], at most 4K pixels.
  const pixelBudget = 8_294_400;
  const density = Number.isFinite(sample.devicePixelRatio) ? Math.max(1, Math.min(2, sample.devicePixelRatio)) : 1;
  const expectedScale = Math.min(density, Math.sqrt(pixelBudget / (width * height)));
  if (!Number.isFinite(sample.pixelRatio) || Math.abs(sample.pixelRatio - expectedScale) > 0.000001) {
    issues.push('responsive backing scale must follow host DPR and the pixel budget');
  }
  if (sample.backingWidth !== Math.max(1, Math.floor(width * expectedScale))
    || sample.backingHeight !== Math.max(1, Math.floor(height * expectedScale))
    || sample.backingWidth * sample.backingHeight > pixelBudget) {
    issues.push('responsive backing dimensions must match the bounded uniform scale');
  }
  return issues;
}
