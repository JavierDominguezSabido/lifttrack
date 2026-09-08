# Contrato de lecturas y outbox vigente (bloques 8–10)

Las migraciones de lectura de bloques 8 y 9 fueron aplicadas manualmente con
SUCCESS, según confirmación del propietario. No se han aplicado desde el agente.
El frontend consume:

| Necesidad | RPC |
| --- | --- |
| Sesión íntegra / edición histórica | lifttrack_read_session_v1 |
| Resumen global | lifttrack_read_history_overview_v3 |
| Historial / filtros / cursor | lifttrack_read_sessions_page_v3 |
| Agregados por ejercicio | lifttrack_read_exercise_progress_v4 |
| Último rendimiento para entrenar | lifttrack_read_last_performance_v2 |

## Estado efectivo e invalidación

HistoryReader vive por cuenta. pendingHistory reduce operaciones no done por
recurso session:ID a la última versión, incluidos error y conflicto. Sea E el
conjunto de IDs afectados y L las sesiones de sus saves: estado efectivo = remoto
sin E + L. Deletes no suman. También se excluyen altas todavía no confirmadas.
Cada lectura captura la generación y clave de outbox; respuestas anteriores se
rechazan. La lectura no confirma escrituras ni sustituye syncRevision.

La caché usa nombre RPC, argumentos y clave de pendientes. Las nuevas versiones
no reutilizan agregados con semántica anterior. Se comparte dentro de la cuenta,
nunca entre cuentas. Foco/reconexión solo refrescan cuando ha pasado el umbral de
60 segundos; cambios de generación invalidan los datos afectados. useHistoryRead
oculta resultados de otra cuenta/generación y permite retener páginas del mismo
filtro mientras se amplía el límite. AbortController evita publicar resultados de
pantallas abandonadas, aunque no implica cancelar todo transporte ya iniciado.

## Paginación

HistoryPager mezcla dos flujos ordenados: páginas remotas y versiones locales
filtradas. Conserva un buffer remoto, IDs ya emitidos y cursor exclusivo del
servidor. Orden: fecha efectiva DESC, startedAt DESC, ID binario UTF-8 DESC.
Conteos total/filtrado cubren todo el conjunto, no solo la página. Ejercicio y
búsqueda son independientes: pueden coincidir con logs distintos. Cambios de
filtro, catálogo, rutina, cuenta o generación reinician el cursor.
No existe fallback que descargue todo para calcular métricas o filtrar.
Importar/exportar sí requiere datos completos explícitamente solicitados.

## Resumen y semanas

Overview excluye E antes de contar, sumar o elegir latestSession. Cliente suma
volumen/sesiones de L. weekProbes cubre semanas locales, sus anteriores y la actual;
permite unir semanas activas y tramos de racha sin descargar el historial de semanas.
Semanas desde lunes en la zona IANA del dispositivo. Sesiones reales incluyen
parciales; racha exige sesiones finalizadas consecutivas desde la semana actual.

## Métricas y equivalencias

Ver [volume-read-contract.md](volume-read-contract.md). Las equivalencias se
resuelven en cliente; progreso selecciona el primer log equivalente por sesión.
Overview suma todos los logs. Por ello no debe reconstruirse el volumen global
sumando grupos equivalentes cuando hay varios logs equivalentes en una sesión.
El récord remoto se obtiene de todo el historial restante, aunque no figure en
recientes. Cliente toma el máximo de ese récord y las series locales válidas.

Último rendimiento para entrenar conserva su contrato independiente: sesión
finalizada, primer log equivalente con series completadas no warmup, prioridad
sesión real frente a initial-, peso base > primera serie válida sin override >
primera válida. No se reutiliza el récord ni el cálculo de la gráfica.

## Offline y límites

Las escrituras locales y la outbox persisten independientemente de la red. Una
lectura offline requiere la base cacheada para exactamente E y los argumentos
actuales. Si no existe, se mantiene pendiente/error de actualización; no se inventa
el siguiente récord ni se presenta el agregado anterior como actualizado.
La convergencia se verifica al estabilizar escrituras y lecturas. RPC separadas no
comparten una instantánea frente a modificaciones simultáneas de otro dispositivo.
Borrar datos del navegador puede perder borradores y operaciones no sincronizadas.
