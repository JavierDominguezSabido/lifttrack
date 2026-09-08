/** Dominio visible con margen y amplitud mínima para no exagerar variaciones pequeñas. */
export function weightChartModel(weights: number[]) {
  if (!weights.length) return { min: 0, max: 10, points: [], flat: false }
  const low = Math.min(...weights), high = Math.max(...weights)
  const span = Math.max(10, high * 0.2, (high - low) * 1.4)
  const min = Math.max(0, (low + high - span) / 2), max = min + span
  const peak = weights.lastIndexOf(high)
  return { min, max, flat: low === high, points: weights.map((weight, index) => ({
    weight, x: weights.length === 1 ? 50 : 8 + index / (weights.length - 1) * 84,
    y: 90 - (weight - min) / span * 80,
    label: index === weights.length - 1 || (index === peak && weight !== weights[weights.length - 1] && Math.abs(index - weights.length + 1) >= Math.max(1, weights.length / 4)),
    last: index === weights.length - 1
  })) }
}
