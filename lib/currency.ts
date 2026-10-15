export const WEN_PER_TAEL = 1000;

export function formatMoney(wen: number): string {
  const taels = Math.floor(wen / WEN_PER_TAEL);
  const remainder = wen % WEN_PER_TAEL;
  if (taels === 0) return `${wen}文`;
  return `${taels}兩${remainder ? `${remainder}文` : ""}`;
}
