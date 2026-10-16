/** A real photo varies. A failed Firefox canvas export is one flat color. */
export function imageDataHasDetail(data: Uint8ClampedArray, sampleEvery = 16) {
  let count = 0;
  let sum = 0;
  let sumSq = 0;
  const step = Math.max(1, sampleEvery) * 4;
  for (let i = 0; i + 3 < data.length; i += step) {
    if (data[i + 3] < 16) continue;
    const lum = data[i] + data[i + 1] + data[i + 2];
    count++;
    sum += lum;
    sumSq += lum * lum;
  }
  if (count < 8) return false;
  const mean = sum / count;
  const variance = sumSq / count - mean * mean;
  return variance > 40;
}
