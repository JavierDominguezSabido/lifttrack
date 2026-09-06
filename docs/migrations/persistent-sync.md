# Bloque 3: cola persistente y conflictos

## Despliegue

1. Comprobar el esquema real y disponer de una copia de seguridad reciente.
2. Aplicar `atomic-workout-sessions.sql` si aún no está instalada la función del
   bloque 1. En instalaciones nuevas está incluida en `../supabase-schema.sql`.
3. Aplicar `persistent-sync.sql`. Añade una tabla de recibos y tres funciones;
   no convierte, borra ni modifica entrenamientos existentes al instalarse.
4. Desplegar el cliente actualizado y recargar las pestañas/PWA antiguas.
5. Verificar con cuentas de prueba guardado sin conexión, recarga, reconexión,
   conflicto entre dispositivos y cambio de cuenta con operaciones pendientes.

La migración se ha probado localmente en PostgreSQL aislado. No se ha aplicado
ni comprobado en el proyecto Supabase desplegado. Si falta, el cliente conserva
las operaciones localmente y muestra el error; no utiliza escrituras inseguras
como alternativa.

## Funcionamiento

Cada operación se guarda en localStorage antes de indicar que el cambio está
guardado. Su identificador, cuenta, recurso, contenido y versión base sobreviven
a recargas. Las sesiones finalizadas y sus borrados también pueden quedar
pendientes; ya no hace falta volver a finalizar manualmente al recuperar red.

La aplicación abierta reintenta al iniciar, al reconectar, tras nuevas operaciones
y cada 15 segundos. Solo envía la cola de la cuenta autenticada. Web Locks coordina
los emisores de distintas pestañas cuando el navegador lo admite; las operaciones
tienen claves independientes y Supabase verifica su identidad y versión en todo caso.

La función `apply_sync_operation` compara una huella del estado remoto con la
versión que se leyó. En una misma transacción escribe el recurso y su recibo. Una
respuesta perdida puede reintentarse con el mismo identificador sin repetir la
mutación. Las operaciones sucesivas del mismo recurso dependen de la confirmación
de su predecesora. El guardado de sesiones delega en la función atómica del bloque 1;
el de rutinas también pasa a ser transaccional para evitar escrituras parciales al
reintentar. Las funciones usan los permisos y RLS del usuario, sin service_role.

Las lecturas de rutinas e historial comprueban su versión antes y después. La UI
conserva los cambios locales pendientes y rechaza respuestas de otra cuenta o de
lecturas anteriores a una edición. Una cuenta conectada no aparece como sincronizada
hasta comprobar los datos y no tener operaciones pendientes.

Las pantallas de edición conservan la versión con la que se abrieron: una lectura
posterior de la caché no autoriza a sobrescribir cambios remotos que el formulario
todavía no mostraba. Los borradores del formulario conservan también esa referencia.

## Conflictos y límites

- La resolución es por recurso completo: sesión, borrador o rutina semanal. No se
  fusionan automáticamente campos o series. Ante conflicto se pausa la cola de la
  cuenta y se conserva la copia local. El usuario puede aplicar la última versión
  local (incluido un borrado pendiente) o descartarla y usar la nube. La decisión
  vuelve a comprobar la versión remota; si hubo otra edición se pide resolverla otra vez.
- Los clientes antiguos o cambios SQL directos no participan en el bloqueo de los
  nuevos escritores. La huella detecta cambios anteriores a la comprobación, pero
  no garantiza aislamiento frente a escrituras antiguas concurrentes durante la
  transacción. Para esa garantía, todos los escritores deben usar el protocolo nuevo.
- La cola requiere los datos de este navegador. Borrarlos elimina operaciones aún
  no confirmadas. Los nuevos guardados se rechazan si no se puede persistir la cola.
  No hay envío en segundo plano con la aplicación cerrada.
- Se conservan metadatos de confirmación locales y recibos SQL para resolver
  dependencias y respuestas perdidas. No se purgan automáticamente; ocupan espacio
  con el uso. El contenido de las operaciones se retira de la cola al confirmar o
  resolver; las cachés de la aplicación se mantienen por separado.
- No se ha cambiado el sistema de paginación existente del historial/catálogo.
  Las comprobaciones de versión no amplían el conjunto de filas que esos lectores
  ya recuperaban.

Validación limitada al bloque: transacciones SQL, respuestas perdidas, conflictos,
cola persistente, rechazo de almacenamiento, cambio de cuenta y lecturas tardías.
Las comprobaciones temporales no se incorporan a la suite permanente; se adaptan
solo las pruebas existentes cuyo contrato cambia con la cola.
