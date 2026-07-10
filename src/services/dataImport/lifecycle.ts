/** Focus, visibilidad y renovaciones de token no cambian el propietario de una importación. */
export function shouldResetPendingImport(previousOwnerId: string, nextOwnerId: string) {
  return previousOwnerId !== nextOwnerId
}
