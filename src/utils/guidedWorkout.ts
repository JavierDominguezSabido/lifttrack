export function resolvePendingGuidedIndex(
  completed: boolean[],
  currentIndex: number,
  reviewCompleted = false
) {
  if (completed.length === 0) return -1

  const safeCurrentIndex = currentIndex >= 0 && currentIndex < completed.length
    ? currentIndex
    : 0

  if (reviewCompleted && currentIndex >= 0 && currentIndex < completed.length) return currentIndex
  if (!completed[safeCurrentIndex]) return safeCurrentIndex

  for (let index = safeCurrentIndex + 1; index < completed.length; index += 1) {
    if (!completed[index]) return index
  }

  return completed.findIndex((isCompleted) => !isCompleted)
}
