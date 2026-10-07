export function orientationScore(data) {
  const words = (data.text || '').match(/[\p{L}]{3,}/gu) || [];
  return Math.max(0, Number(data.confidence) || 0) * Math.min(1, words.length / 20);
}

export function chooseOrientation(candidates, originalRotation) {
  const ranked = [...candidates].sort((a, b) => b.score - a.score || a.order - b.order);
  const original = candidates.find(c => c.rotation === originalRotation);
  const best = ranked[0];
  const confident = best.score >= 45 && best.score - (ranked[1]?.score || 0) >= 8;
  return { ...(confident ? best : original), uncertain: !confident };
}

// The render callback applies the same absolute PDF rotation used for preview/export.
export async function recognizeOrientedPage({ worker, render, rotation, checkCancelled, recognize, onProgress }) {
  const candidates = [];
  for (const [order, delta] of [0, 90, 180, 270].entries()) {
    checkCancelled();
    const angle = (rotation + delta) % 360;
    onProgress(`Orientamento ${order + 1}/4`);
    const image = await render(angle, 1.35);
    const result = await recognize(worker, image, false);
    candidates.push({ rotation: angle, score: orientationScore(result.data), order });
  }
  checkCancelled();
  const chosen = chooseOrientation(candidates, rotation);
  onProgress('Lettura ad alta risoluzione');
  const image = await render(chosen.rotation, 3);
  const result = await recognize(worker, image, true);
  checkCancelled();
  return { data: result.data, rotation: chosen.rotation, uncertain: chosen.uncertain, candidates };
}
