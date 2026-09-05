// Compartida entre montajes: un borrado espera incluso a un envío iniciado
// desde una página que ya se ha desmontado. Un fallo no bloquea la cola.
const queues = new Map<string, Promise<unknown>>()

export function enqueueDraftWrite<T>(userId: string, draftKey: string, operation: () => Promise<T>): Promise<T> {
  const key = JSON.stringify([userId, draftKey])
  const result = (queues.get(key) ?? Promise.resolve()).catch(() => undefined).then(operation)
  queues.set(key, result)
  const cleanup = () => { if (queues.get(key) === result) queues.delete(key) }
  void result.then(cleanup, cleanup)
  return result
}
