# Migraciones de LiftTrack

Estado del proyecto existente según confirmaciones manuales del propietario:

| Archivo | Estado / finalidad |
| --- | --- |
| atomic-workout-sessions.sql | Aplicada y verificada: guardado transaccional |
| persistent-sync.sql | Aplicada y verificada: revisiones, conflictos y cola |
| workout-history-read-api.sql | Aplicada: lecturas iniciales |
| workout-history-pagination-v2.sql | Aplicada: contrato de filtros y conteos |
| workout-history-outbox-reads.sql | Aplicada: exclusiones y reconciliación |
| workout-exercise-performed-record-v3.sql | Aplicada: récord realizado |
| workout-history-series-volume-v3.sql | Aplicada: volumen global efectivo |
| workout-exercise-volume-v4.sql | Aplicada: volumen por ejercicio efectivo |

No volver a ejecutar migraciones aditivas que ya existen. No se han conectado ni
modificado datos del proyecto remoto durante el cierre técnico.

Para una instalación nueva, revisar supabase-schema.sql y las dependencias de
cada archivo: algunas funciones ya forman parte del esquema base. Este listado
no sustituye un instalador ni autoriza repetir CREATE FUNCTION. add-workout-drafts.sql
es histórico y debe contrastarse con el esquema real antes de usarlo.

Contratos actuales: [lecturas/outbox](../read-outbox-contract.md),
[métricas](../volume-read-contract.md). Finalizar sin red conserva la sesión local
y su operación pendiente. No se requiere reintentar manualmente cada sesión ni
esperar al servidor para registrar cambios locales. Conflictos y revisiones sí
están implementados; persistent-sync.md detalla la escritura.
