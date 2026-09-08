# Lecturas del bloque 8 y outbox

Migración manual: `migrations/workout-history-outbox-reads.sql`. No está aplicada
por el agente. No requiere modificar datos, tablas, RLS ni funciones anteriores.
Requiere las dos migraciones de lectura ya instaladas y los mismos permisos de
lectura sobre las tablas. Las cuatro funciones nuevas son STABLE, SECURITY
INVOKER, con search_path vacío, comprobación de auth.uid(), joins por propietario
y EXECUTE para authenticated (revocado a PUBLIC y anon).

## Auditoría y versiones

| Lectura | Problema con pendientes | Contrato nuevo |
| --- | --- | --- |
| session v1 | Puede devolver la versión anterior o una sesión borrada localmente | Se conserva: consultar primero la outbox; si existe save, usar su sesión íntegra; si delete, tratarla como ausente. Si no, leer v1 y descartar la respuesta si cambia la generación local. |
| overview v1 | Conteos, volumen, catálogo histórico, última sesión, días y semanas incluyen versiones reemplazadas | overview v2 excluye IDs y devuelve además cobertura de semanas consultadas. |
| sessions page v2 | Filas, conteos y límites incluyen versiones reemplazadas; una edición puede cambiar filtros y fecha | sessions page v3 excluye IDs antes de filtros, conteos y cursor. |
| exercise progress v1 | Eliminar/modificar un máximo o el último log exige conocer el siguiente candidato histórico | exercise progress v2 calcula todos los agregados del resto, no solo de la página reciente. |
| last performance v1 | El último rendimiento puede estar borrado, cambiado o carecer ya de series válidas | last performance v2 devuelve el mejor candidato del resto. |

Firmas (los parámetros anteriores conservan sus tipos y valores por defecto):

```sql
lifttrack_read_history_overview_v2(
  p_user_id uuid, p_timezone text, p_now timestamptz default now(),
  p_excluded_session_ids text[] default '{}',
  p_local_week_starts date[] default '{}'
) returns jsonb

lifttrack_read_sessions_page_v3(
  p_user_id uuid, p_timezone text, p_template_days jsonb,
  p_limit integer default 20, p_cursor jsonb default null,
  p_exercise_ids text[] default null, p_search_exercise_ids text[] default null,
  p_day_of_week integer default null, p_from timestamptz default null,
  p_to timestamptz default null, p_include_initial boolean default false,
  p_excluded_session_ids text[] default '{}'
) returns jsonb

lifttrack_read_exercise_progress_v2(
  p_user_id uuid, p_exercise_ids text[], p_limit integer default 8,
  p_excluded_session_ids text[] default '{}'
) returns jsonb

lifttrack_read_last_performance_v2(
  p_user_id uuid, p_exercise_ids text[],
  p_excluded_session_ids text[] default '{}'
) returns jsonb
```

## Estado efectivo y aislamiento

Para la cuenta activa, reducir las operaciones no `done` en el mismo orden que
`pendingOperations`/`overlayPendingSessions`, conservando la última por recurso
`session:ID`. Incluir pending, error y conflict. Sea E el conjunto de todos esos
IDs, incluso altas aún no confirmadas, y L las versiones completas de los saves
resultantes; los deletes no aportan ninguna sesión.

El estado efectivo es **(confirmado menos E) unión L**. Los conjuntos son
disjuntos por ID; no hay restas aproximadas de máximos ni dobles conteos. Excluir
también las altas evita duplicarlas si su escritura llegó al servidor pero aún
no se ha recibido la confirmación. Un cambio de ejercicios/series reemplaza la
sesión entera, no solo sus logs alterados. No modificar la cola para hacer lecturas.

Usar el mismo E, L, cuenta, zona y contexto de rutina/catálogo para las lecturas
de una generación. Capturarlos antes de solicitar datos. Cambios de operaciones,
confirmaciones, resolución de conflictos o cambio de cuenta invalidan esa
generación: descartar respuestas anteriores, reiniciar cursores y volver a leer.
No aplicar a una respuesta de E antiguo un L más reciente. Las lecturas no son
receipts y no deben confirmar operaciones ni sobrescribir sus revisiones base.

Una llamada tiene snapshot consistente; llamadas separadas no comparten snapshot
frente a escrituras de otros dispositivos. La invalidación/refresco sigue siendo
necesaria. La convergencia se comprueba cuando escritura y lecturas se estabilizan:
al confirmarse una operación desaparece de E/L y su estado entra en el servidor.

## Overview: sumas y uniones de semanas

Todos los campos anteriores describen únicamente el resto confirmado R:

- sessionCount y totalVolume: sumar las contribuciones de L sin `initial-`.
  Respetar volumeKg explícito (también cero); si falta, sumar reps * weightKg de
  series completadas, incluidos calentamientos, igual que getHistorySummary.
- exerciseLogCounts: sumar los logs de L por ID original, sin `initial-`.
  Resolver después equivalencias/canónicos con el catálogo y rutina locales.
- latestSession: elegir entre el candidato remoto y L con el mismo orden.
- currentWeekCompletedDays: unión con los días explícitos de L finalizadas en
  la semana actual. Las semillas no participan.
- activeWeeks y streakWeeks **no son sumables**. Para reconciliarlas, enviar en
  p_local_week_starts todos los lunes locales distintos de L sin `initial-`,
  incluyendo sesiones parciales. El parámetro contiene fechas YYYY-MM-DD,
  obtenidas con getWeekStart en la misma zona IANA que p_timezone.

weekProbes devuelve `{weekStart, active, completedRunStart}` para esos lunes,
sus lunes anteriores y la semana actual (como máximo 2 * semanas locales + 1).
`active` indica si R tiene sesiones en esa semana. `completedRunStart` es el
primer lunes del tramo consecutivo de semanas finalizadas de R que contiene la
semana consultada; NULL indica que esa semana no tiene sesión finalizada en R.
No se devuelve el listado histórico de semanas.

Semanas activas = activeWeeks remoto + número de semanas distintas de L cuyo
probe.active es false. Para la racha, empezar en el lunes actual:

1. Si L tiene sesión finalizada esa semana, sumar uno y retroceder una semana.
2. Si no, consultar su probe. Si completedRunStart es NULL, terminar.
3. Sumar todas las semanas desde completedRunStart hasta el cursor incluido y
   saltar al lunes anterior a completedRunStart.
4. Si ese hueco pertenece a L finalizada, continuar con 1; en otro caso terminar.

Cada vuelta consume una semana local o un tramo remoto. No hace falta descargar
semanas intermedias, ni sesiones, ni pedir una RPC por semana de una racha larga.
La resta de semanas es de calendario local, no de milisegundos de 7 días en DST.

## Paginación y filtros

Los filtros de fecha, día histórico, grupo equivalente y búsqueda independiente
conservan exactamente el contrato v2. Resolver ambos arrays de IDs en cliente
después de reconciliar exerciseLogCounts con L; aplicar las mismas condiciones a
L. No intersectar filtro y búsqueda: pueden corresponder a logs diferentes.

totalCount efectivo = remoto + cantidad de L dentro del universo (`initial-`
según el parámetro). filteredCount efectivo = remoto + cantidad de L que cumple
todos los filtros. Ambos se refieren a todo el resultado, nunca al cursor.

Mantener DOS flujos ordenados: páginas remotas y L filtrado/ordenado. Mezclarlos
por fecha efectiva DESC, startedAt DESC, client_id COLLATE C DESC, emitiendo cada
ID una sola vez. Comparar timestamps como instantes y el ID en orden binario
UTF-8, no con localeCompare. Este desempate ya está definido por las RPC previas.
Conservar un buffer de filas remotas no consumidas y el índice del flujo local.
nextCursor pertenece a la página REMOTA descargada; solo usarlo después de
consumir su buffer. No derivarlo del último elemento local o de la página mezclada.
hasMore efectivo = buffer remoto no vacío OR hasMore remoto OR L sin consumir.
Esto evita perder filas cuando las inserciones locales desplazan filas remotas.
Al cambiar E/L/filtros/canónicos/rutina/zona, reiniciar ambos flujos.

## Progreso y último rendimiento

exercise progress v2 mantiene los campos anteriores; añade startedAt a latest y
entries para mezclar con locales en empates sin pedir cada sesión completa.
Elegir el primer log equivalente de cada sesión local, igual que en HistoryPage.
Sumar sessionCount/accumulatedVolume, tomar max(0, bestWeight remoto, pesos de L),
y mezclar los recientes por orden, reteniendo N. El máximo remoto se calcula
sobre TODO R aunque el siguiente récord no figure entre esos N registros.
Con N candidatos remotos bastan N locales/remotos mezclados para el top N.
Para cargar más registros, usar el flujo paginado v3 filtrado por el ejercicio.

last performance v2 añade startedAt al candidato. Elegir entre este y el candidato
local de getLastExercisePerformanceFromSessions. Mantener prioridad sesión real
antes de initial-, sesión finalizada, primer log equivalente y al menos una serie
completada no de calentamiento. Peso base > primera serie válida sin override >
primera válida. Nunca reutilizar el cálculo de Progreso para este propósito.
El cliente debe decodificar campos JSON nullable como los opcionales actuales.

## Límite offline y aplicación manual

La reconciliación es exacta con una base remota correspondiente a E. Si se cambia
E estando offline y no existe esa base en caché ni suficiente historial local,
ninguna RPC puede revelar un segundo récord desconocido sin conexión. No es
posible prometer simultáneamente ausencia de red, ausencia de historial completo
local y disponibilidad inmediata de cualquier agregado nuevo. El futuro frontend
debe conservar la operación local inmediatamente y no presentar como actualizado
un agregado que aún no puede determinar; recalcular al disponer de la base. Esta
migración resuelve el contrato online, no oculta ese límite con valores incorrectos.

Para aplicar: abrir SQL Editor del proyecto correcto y ejecutar el archivo SQL
completo una sola vez. BEGIN/COMMIT hace atómica su instalación. CREATE FUNCTION
sin OR REPLACE protege las versiones existentes: si el nombre ya existe, parar
y revisar el error, no borrar funciones para reintentarlo. No requiere copia de
datos ni limpieza previa; no se ejecuta desde el frontend ni se usa service_role
para saltarse auth.uid(). Tras SUCCESS se puede integrar el frontend, aún pendiente.
