# Guardado atómico de sesiones (bloque 1)

## Instalación

En una base existente con el esquema de LiftTrack, ejecutar
`atomic-workout-sessions.sql` en el editor SQL de Supabase **antes de desplegar
el nuevo cliente**. Para una instalación nueva, `../supabase-schema.sql` ya
incluye esta función. La migración se puede repetir y no transforma ni elimina
sesiones existentes.

El cliente utiliza exclusivamente `save_workout_session` para crear y editar
sesiones. La función ejecuta cabecera, ejercicios y series en una transacción,
con los permisos del usuario y las políticas RLS existentes. Reintentar el
mismo `client_id` actualiza la misma sesión. Un error revierte también el
borrado de las series anteriores. No se necesita una clave `service_role` en
el navegador.

Si la función no existe, el cliente muestra un error específico y conserva el
borrador. No vuelve al antiguo guardado mediante peticiones independientes.

## Comportamiento y límites

- Cada edición del entrenamiento se guarda localmente antes de la sincronización,
  incluso si la lectura inicial de Supabase falla. Los errores de almacenamiento
  local se muestran explícitamente y permiten reintentar.
- La nube se actualiza con debounce. Las escrituras de cada borrador se ordenan
  dentro de la pestaña; su borrado espera las escrituras pendientes. Una respuesta
  antigua no confirma una edición nueva ni vuelve a crear el borrador local.
- Reconectar o pulsar Reintentar vuelve a consultar la nube antes de enviar.
- Finalizar en modo nube requiere confirmación del servidor. Sin red, el borrador
  permanece en el dispositivo; hay que volver a pulsar Finalizar y guardar.
  No se ha añadido una cola de sesiones finalizadas en segundo plano.
- Una respuesta perdida permite reintentar incluso tras recargar: la identidad
  deriva de la rutina y del instante original de inicio conservado en el borrador.
- La cabecera indica modo, actividad, desconexión o error. Solo el estado del
  borrador confirma que su versión concreta está sincronizada.
- El descarte en modo nube conserva el borrador si no puede confirmar su borrado.
- Esto no incorpora resolución de conflictos entre pestañas o dispositivos que
  editen simultáneamente. Tampoco protege frente a borrar los datos del navegador.

## Verificación

`npm test` incluye pruebas de la función SQL real en PostgreSQL aislado (PGlite):
rollback, repetición de migración, reintentos, actualización, volumen y aislamiento
por usuario. También incluye pruebas de la pantalla con red simulada, respuestas
tardías, recarga y fallo de almacenamiento local.

Antes del despliegue, comprobar en un entorno Supabase con esta migración que una
sesión se guarda y edita, que un reintento no la duplica y que otro usuario no puede
acceder a ella. Las pruebas locales no verifican la configuración del proyecto
Supabase desplegado. La migración no se ha aplicado remotamente desde este cambio.
