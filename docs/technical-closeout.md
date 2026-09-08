# Cierre técnico — bloque 10

## Arquitectura y extracciones

- HistoryPage conserva composición, estado y navegación; historyPresentation
  concentra filtros, selección equivalente y presentación de métricas, con tests
  que importan directamente el dominio sin cargar la pantalla.
- workoutDraftStorage comparte contrato y descubrimiento de borradores entre Hoy
  y entrenamiento. Autosave, claves, revisiones y compatibilidad permanecen iguales.
- Confirmation contiene el diálogo; confirmAction administra montaje, resultado,
  inert y restauración de foco. Pruebas reales de Tab, Escape, confirmar y volver.
- Se retiró el volcado informativo de sesiones CSV en consola. Se conservan avisos
  de validación de posible pérdida de series y errores reales de almacenamiento.
- No se extrajeron masivamente SettingsPage ni WorkoutPage: su división restante
  es deuda acotada, no un bloqueo que justifique arriesgar UX/autosave aprobados.

## Lectura y estado

Contratos vigentes en read-outbox-contract.md y volume-read-contract.md.
La arquitectura conserva paginación, caché por cuenta, exclusiones, buffer remoto,
descarte de respuestas antiguas y resolución de conflictos. No se ha modificado
Supabase, SQL, escritura, fórmulas ni el diseño en este cierre.
Los tests SQL de versiones anteriores se conservan como protección de contratos
históricos, no como definición vigente de métricas.

## PWA

Manifest LiftTrack standalone, inicio/scope raíz, colores dark e iconos SVG 192/512
con variante maskable. Idioma corregido a es. Edge no reporta errores del manifest
ni de instalabilidad en perfil aislado normal; no se instaló en el SO del usuario.

VitePWA autoUpdate genera service worker y precache de HTML, JS, CSS, manifest e
iconos. cleanupOutdatedCaches está activo. Sin runtime caching de RPC ni respuestas
Supabase: datos locales/outbox/caché de lecturas siguen sus almacenes separados.
La actualización activa el nuevo worker automáticamente; borradores y outbox no
son parte de CacheStorage ni se borran al limpiar precache.

Recarga offline verificada sobre build de producción en /, /rutina, /progreso,
/cuenta, /rutina/editar, /rutina/ejercicios y /entrenamiento/lunes después de una
primera visita online. La primera visita sin assets cacheados requiere conexión.
Las solicitudes de actualización del worker pueden fallar al cortar la red; esto
no impide el shell offline. No hay errores JS de aplicación en la prueba.

## Validación

- 29 archivos, 166 tests: rutina, ejercicios, entrenamiento, borradores, importación,
  exportación, edición histórica, paginación, métricas, cuentas y outbox.
- Tres tests nuevos: dos de confirmación real/accesibilidad; uno de progreso online
  -> offline -> edición pendiente -> reconexión con base excluida y métrica exacta.
- TypeScript y build PWA correctos; lint completo sin errores ni warnings.
- Nueve vistas a 1440, 390 y 320x568: Hoy, Rutina, Sesiones, Por ejercicio, Cuenta,
  editor, biblioteca, entrenamiento completo y guiado. Sin overflow horizontal.
- Guiado: completar -> Anterior mantiene geometría al estabilizar transiciones;
  controles inferiores accesibles por scroll a 320x568.

## Límites de la verificación

Supabase desplegado no se consultó: contratos SQL probados en PGlite y frontend
con red simulada. No se hizo instalación real en iOS/Android ni prueba de upgrade
entre dos despliegues de producción. Se comprobó registro/control/caché del SW
local y requisitos de instalación de Edge. Métricas offline necesitan una base
exacta; borrar almacenamiento del navegador puede perder operaciones pendientes.
