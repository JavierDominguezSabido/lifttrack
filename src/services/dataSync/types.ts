import type { ImportPayload } from '../dataImport/types'

/**
 * Contrato reservado para futuros adaptadores como Google Sheets o Drive.
 * No hay ningún proveedor externo implementado en esta fase.
 */
export interface DataSyncAdapter {
  id: string
  exportData(): Promise<void>
  importData(): Promise<ImportPayload>
}
