# Bloque 9: contrato único de volumen (integración pendiente)

Migración manual: `migrations/workout-history-series-volume-v3.sql`.
No aplicada por el agente. No modifica tablas, datos ni funciones anteriores.

## Firma

```sql
lifttrack_read_history_overview_v3(
  p_user_id uuid, p_timezone text, p_now timestamptz default now(),
  p_excluded_session_ids text[] default '{}',
  p_local_week_starts date[] default '{}'
) returns jsonb
```

Solo cambia `totalVolume`: suma de `reps * COALESCE(weight_override_kg, weight_kg)`
para series completadas, incluidos calentamientos, en todas las sesiones reales
confirmadas no excluidas. Incluye sesiones parciales. Sin filas, devuelve 0.
No consulta `workout_sessions.volume_kg` para este agregado.
Los demás campos, semanas locales desde lunes, racha, conteos, latestSession y
weekProbes conservan exactamente v2. latestSession sigue siendo la sesión íntegra
original: su campo volumeKg puede ser antiguo y NO debe utilizarse como métrica.
SECURITY INVOKER, auth.uid(), RLS y permisos authenticated sin PUBLIC/anon.

## Alineación futura del cliente (no implementada aquí)

Una única función compartida calculará volumen desde las series:

```ts
session.exerciseLogs.reduce((total, log) => total + log.sets.reduce(
  (sum, set) => sum + (set.completed
    ? set.reps * (set.weightOverrideKg ?? set.weightKg) : 0), 0), 0)
```

No usar `||` para el override: cero es válido. No filtrar calentamientos ni exigir
completedAt de la sesión. No usar workingWeightKg ni volumeKg como fallback.
Usar esta función en resumen local, sesiones, detalles, exportaciones de métricas,
volumen por ejercicio (sobre el primer log equivalente, según contrato vigente)
y contribuciones de saves pendientes. El valor almacenado puede conservarse como
dato de transporte, pero no como fuente de verdad de las métricas.

Estado efectivo: remoto excluyendo todos los IDs con operación no done más las
últimas versiones locales de saves; deletes no suman. Incluye error/conflict y
altas no confirmadas. Al confirmar, invalidar la generación y obtener la base
remota correspondiente. Si offline falta esa base exacta, mantener el agregado
pendiente, sin descargar todo el historial ni presentar cifras antiguas como nuevas.

## Límite pendiente en otra lectura

exercise_progress_v3 conserva de v2 `accumulatedVolume` y `entries.volumeKg`
calculados con weight_kg sin COALESCE del override. Si ambos campos difieren,
no cumplen aún la definición unificada. No debe declararse completa la integración
ni corregirse el agregado remoto usando solo los registros recientes. Esta
migración se limita a overview; esa lectura requiere una decisión/versionado
posterior autorizado antes de integrar la definición en todas las métricas.

## Aplicación manual

Ejecutar el archivo SQL completo en SQL Editor del proyecto correcto. BEGIN/COMMIT
hace atómica la creación y sus permisos. CREATE FUNCTION sin OR REPLACE falla si
v3 ya existe: no borrar ni reemplazar para reintentar. Requiere el mismo esquema
que overview v2, lifttrack_read_session_v1 y set_logs.weight_override_kg.
No necesita copia de datos ni limpieza: no ejecuta DML sobre las tablas.

## Actualización: progress v4 preparada, pendiente de aplicación manual

`migrations/workout-exercise-volume-v4.sql` resuelve la limitación anterior sin
modificar v3. Firma: `lifttrack_read_exercise_progress_v4(p_user_id uuid,
p_exercise_ids text[], p_limit integer default 8,
p_excluded_session_ids text[] default '{}') returns jsonb`.
Solo cambia la fórmula interna de volumen a reps * COALESCE(override, weight),
para accumulatedVolume y entries.volumeKg. bestWeight, peso base, reps, fechas,
orden, límites, exclusiones, primer equivalente y demás campos conservan v3.

La fórmula coincide con overview v3; el universo de suma es diferente por diseño:
overview incluye todos los logs, progreso el primero equivalente de cada sesión.
No sumar los grupos equivalentes esperando reconstruir el volumen global si una
sesión contiene varios logs equivalentes. La integración frontend sigue pendiente.
Ejecutar el archivo completo una sola vez en SQL Editor; no reemplazar v3.
