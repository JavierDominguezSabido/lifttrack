# Auditoría dirigida de rendimiento — 28 septiembre 2026

## Alcance y entorno

Inspección del código actual, build de producción local, tests con RPC simuladas y Chrome
aislado con datos de prueba. No se accedió a Supabase real. No se modificaron contratos,
sincronización, persistencia, métricas, estilos, dependencias ni migraciones.

## Mejora implementada y mediciones

El arranque importaba todas las pantallas, incluso las herramientas de datos y la edición
histórica. Ahora Hoy, Rutina y Pendientes siguen en el módulo inicial; Progreso,
Configuración, Entrenamiento y edición histórica comparten un único módulo diferido.
Así se evita generar muchos archivos pequeños y se reutiliza el módulo al navegar.

| Medición del build local | Antes | Después |
| --- | ---: | ---: |
| JavaScript principal | 419.780 bytes | 278.419 bytes |
| Principal comprimido con gzip | 126.801 bytes | 88.757 bytes |
| JavaScript secundario diferido | — | 142.889 bytes |
| JavaScript total, incluido workbox-window | 425.528 bytes | 427.056 bytes |
| JavaScript total comprimido, suma de archivos | 129.159 bytes | 130.583 bytes |
| Precache PWA | 8 entradas / 474,51 KiB | 9 entradas / 476,03 KiB |

El principal disminuye un 33,7 % en bruto y un 30,0 % comprimido. El total crece ligeramente
por la separación y el tratamiento de carga/error. La PWA sigue precargando el módulo
secundario para permitir su primera apertura offline: no se afirma una reducción del
tráfico total de instalación. Se difiere su evaluación hasta abrir una pantalla secundaria.

Cinco arranques por versión, Chrome headless a 390×844, perfiles nuevos, localhost,
service worker bloqueado y fuentes externas bloqueadas: mediana hasta observar el estado
útil de Hoy de 105,4 ms antes y 111,0 ms después. La muestra y el entorno no permiten
afirmar una mejora de tiempo; la reducción comprobada es de código principal. No son
resultados de Lighthouse ni Web Vitals de producción.

## Peticiones y navegación

No se cambiaron peticiones de datos ni invalidaciones. Coste identificado en el código
para una cuenta autenticada, sin errores, caché previa ni operaciones pendientes:

- La carga común del provider usa un overview y una página de diez sesiones. La rutina
  usa cuatro consultas y dos lecturas de revisión. Autenticación queda fuera de este conteo.
- Hoy añade el listado de pendientes, paginado de cien en cien. Cada borrador válido
  puede añadir una lectura individual, dos comprobaciones de revisión y una lectura de
  sesión por identidad. La limpieza demostrable puede activar el flujo de escritura existente.
- Rutina y Cuenta no añaden lecturas de historial por el simple hecho de abrirlas.
- Progreso/Sesiones usa una página por cursor y filtro. Las claves incluyen los días de
  las plantillas: no siempre comparte la primera página del provider, que usa un mapa vacío.
  No se unificaron esas claves porque el contrato contempla identificación histórica.
- Por ejercicio solicita un agregado por ejercicio candidato y páginas del ejercicio elegido.
  Los agregados sirven también para ordenar y presentar el selector; no se eliminaron.
- Entrenamiento solicita último rendimiento por ejercicio. Recuperar un pendiente también
  puede consultar borradores. La caché existente evita repetir lecturas idénticas vigentes.
- Cuenta/Datos sigue cargando datos completos para importación/exportación explícitas.
  Ese flujo no se monta al abrir solamente Cuenta.

El test de navegación confirmó una RPC de página al abrir Progreso, una adicional al cargar
diez sesiones más y ninguna adicional al volver a la misma consulta. StrictMode no duplicó
esas lecturas. En Chrome, Hoy y Rutina no solicitaron el módulo secundario; navegar después
por Cuenta, Progreso y Entrenamiento lo solicitó una sola vez antes de recargar el documento.

## Cálculos, renders, memoria y recursos

- La vista remota trabaja con páginas y agregados; no se añadió ningún fallback de historial
  completo. La prueba de 1.005 sesiones verifica orden, conteos, buffer y ausencia de duplicados:
  una petición para la primera página y 101 únicamente al recorrer expresamente todo el conjunto.
- La inspección de efectos encontró limpieza de listeners, temporizadores y suscripción de auth.
  No se demostró una fuga de memoria ni una reducción de renders que justificara añadir memoización.
- El lector mantiene resultados en memoria hasta invalidación y serializa hasta sesenta lecturas
  para offline. Alterar esos límites o escrituras afectaría persistencia/caché y queda fuera de alcance.
- No hay imágenes pesadas: los tres SVG públicos suman 837 bytes. Los iconos se importan por nombre
  y no hay una biblioteca de gráficas pesada. No se sustituyeron dependencias.
- Inter se solicita mediante un import de Google Fonts en el CSS. Existe esa dependencia externa
  de carga, pero esta prueba no midió su coste real; no se cambiaron fuentes ni estilos.

## PWA y recuperación de módulos

El service worker conserva su configuración. El precache incluye archivos estáticos y el
módulo diferido; no hay reglas de runtime cache para respuestas de Supabase. Se verificaron
las nueve entradas almacenadas en Chrome, la activación del service worker y la apertura
directa de Entrenamiento offline sin haber visitado antes esa pantalla. Completar una serie
y recargar Hoy offline conserva el pendiente.

La nueva envoltura de rutas mantiene la navegación mientras carga. Ante un fallo del módulo
muestra una opción para recargar; cambiar de ruta permite volver a Hoy. Cambiar la ruta no
remonta por sí solo un formulario compartido ni reinicia sus cambios sin guardar.

## Validación

- 62 tests aprobados en siete archivos: carga diferida, navegación, paginación, filtros,
  edición histórica, caché, cuentas, respuestas antiguas, outbox, rutina y entrenamiento.
- TypeScript de aplicación y configuración: correcto.
- ESLint de archivos modificados: correcto.
- Build de producción con generación PWA: correcto.
- Chrome a 390 y 1440 px: Hoy, Rutina, Cuenta, Progreso, Por ejercicio, Entrenamiento y
  edición por URL directa sin errores de ejecución; descarga secundaria reutilizada.
- Simulación de fallo de descarga: aviso de recuperación y navegación a Hoy correctos.
- `git diff --check`: correcto.

No se midieron latencia de Supabase real, tiempos en un teléfono físico, Lighthouse de
producción ni evolución del heap en una sesión prolongada. La prueba PWA cubre Chrome,
no la instalación nativa de todas las plataformas. Las oportunidades que afectan lecturas,
sync o persistencia se documentan arriba y no se implementan en esta pasada.
