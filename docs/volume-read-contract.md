# Métricas definitivas (bloques 9–10)

RPC activas: overview_v3 y exercise_progress_v4, aplicadas manualmente con SUCCESS
según el propietario. Las versiones anteriores se conservan como compatibilidad;
el frontend no utiliza sus fórmulas antiguas.

- Volumen: suma de reps * (weightOverrideKg ?? weightKg), solo series completadas,
  incluidos calentamientos. Admite sesiones parciales; cero es override válido.
  getSessionVolume es la utilidad compartida para métricas locales y presentación
  de sesiones completas. volumeKg almacenado no es fuente de verdad.
- Mejor peso realizado: máximo peso efectivo de series completadas no warmup.
  getPerformedWeight es el helper local; sin candidatas devuelve cero.
- Peso de trabajo: workingWeightKg o primera serie completada (o cero); representa
  la base registrada y se conserva separado del récord realizado.
- Fecha efectiva: completedAt ?? startedAt. Presentación y semana en zona local;
  orden del historial por instante, no por representación textual del offset.
- Sesiones: sesiones reales, no initial-, incluidas parciales. Por ejercicio se
  cuenta una vez cada sesión con el primer log equivalente.
- Volumen por ejercicio: misma fórmula sobre ese primer log. Overview incluye
  todos los logs: los universos difieren si existen múltiples logs equivalentes.
- Semanas activas: semanas locales con sesiones reales. Racha: semanas consecutivas
  con sesión finalizada, comenzando en la actual; lunes como inicio.
- Última vez / recientes: misma fecha efectiva y universo del ejercicio. La gráfica
  muestra los últimos ocho pesos base, espaciados por sesión, no por tiempo transcurrido.
  Su máximo visible no sustituye al récord histórico realizado.

Outbox: remoto excluyendo IDs pendientes + últimas versiones locales. Sumar
volumen local calculado desde series, nunca el agregado almacenado. Borrados no
aportan sesiones. Si offline falta base exacta, conservar operación y marcar la
lectura pendiente; no usar un agregado antiguo ni descargar todo como fallback.

Migraciones de referencia (NO reaplicar):
- workout-exercise-performed-record-v3.sql: separó récord y base.
- workout-history-series-volume-v3.sql: volumen global desde series efectivas.
- workout-exercise-volume-v4.sql: volumen por ejercicio con la misma fórmula.

No hay progresión automática añadida: el entrenamiento recupera el último
rendimiento según el contrato propio descrito en read-outbox-contract.md.
