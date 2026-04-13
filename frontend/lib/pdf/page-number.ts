/**
 * react-pdf の numPages（総ページ数）の検証用。
 * UI の現在ページは 1-based で [1, numPages] にクランプする。
 */
export function isValidPdfPageCount(n: number): boolean {
  return Number.isFinite(n) && n >= 1;
}
