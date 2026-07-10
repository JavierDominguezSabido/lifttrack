# LiftTrack

<p align="center">
  <strong>Registro y seguimiento de entrenamientos de fuerza, con sincronización entre dispositivos.</strong>
</p>

<p align="center">
  <a href="https://lifttrack-alpha.vercel.app/">Demo</a>
  ·
  <a href="https://github.com/JavierDominguezSabido/lifttrack">Repositorio</a>
</p>

<p align="center">
  <img alt="React" src="https://img.shields.io/badge/React-19-20232a?logo=react&logoColor=61DAFB">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white">
  <img alt="Vite" src="https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white">
  <img alt="Supabase" src="https://img.shields.io/badge/Supabase-Auth%20%2B%20Database-3FCF8E?logo=supabase&logoColor=white">
  <img alt="Vercel" src="https://img.shields.io/badge/Vercel-Deploy-000000?logo=vercel&logoColor=white">
  <img alt="PWA" src="https://img.shields.io/badge/PWA-Instalable-5A0FC8?logo=pwa&logoColor=white">
</p>

<p align="center">
  <img src="docs/screenshots/dashboard-desktop.png" alt="Panel principal de LiftTrack en escritorio" width="100%">
</p>

## Descripción

**LiftTrack** es una aplicación web progresiva para registrar entrenamientos de fuerza, gestionar una rutina semanal y consultar la evolución de cada ejercicio.

El proyecto está diseñado para funcionar tanto en móvil como en escritorio. Los entrenamientos, cambios y borrados se sincronizan mediante Supabase, mientras que los entrenamientos en curso utilizan un sistema de borrado automático local y remoto para poder continuar desde otro dispositivo sin convertir el borrador en una sesión definitiva.

La aplicación se encuentra desplegada en Vercel y se utiliza como proyecto real de seguimiento de entrenamiento.

## Funcionalidades

### Entrenamiento

- Rutina semanal editable.
- Biblioteca y gestión de ejercicios.
- Registro de peso de trabajo, series y repeticiones.
- Vista completa con todos los ejercicios del día.
- Modo guiado para avanzar serie por serie.
- Indicador visual de series completadas, actual y pendientes.
- Recuperación de la posición y del estado del entrenamiento.
- Sugerencias basadas en el último registro.
- Añadir o eliminar series durante la sesión.

### Historial y progreso

- Historial de sesiones guardadas.
- Edición y eliminación de entrenamientos.
- Filtros por ejercicio, día, periodo y búsqueda.
- Progreso por ejercicio.
- Gráfica de peso de trabajo por fecha.
- Mejor peso, número de sesiones y volumen acumulado.
- Registros recientes con pesos, repeticiones y volumen.

### Sincronización y seguridad de datos

- Registro e inicio de sesión con Supabase Auth.
- Sincronización de sesiones entre dispositivos.
- Row Level Security para aislar los datos de cada usuario.
- Borradores locales inmediatos para evitar pérdidas.
- Borradores sincronizados en Supabase.
- Resolución sencilla de borradores por fecha de actualización.
- Funcionamiento local cuando no hay conexión.
- Importación y exportación de copias completas en JSON.

### Experiencia de usuario

- Diseño responsive para móvil, tablet y escritorio.
- PWA instalable.
- Temas claro y oscuro.
- Navegación adaptada a cada tamaño de pantalla.
- Estados de sincronización, errores y confirmaciones.
- Interfaz táctil para utilizar durante el entrenamiento.

## Capturas

### Rutina semanal

<p align="center">
  <img src="docs/screenshots/routine-desktop.png" alt="Rutina semanal de LiftTrack" width="100%">
</p>

### Registro de entrenamiento

<p align="center">
  <img src="docs/screenshots/training-full-desktop.png" alt="Vista completa de un entrenamiento" width="100%">
</p>

### Modo guiado en móvil

<p align="center">
  <img src="docs/screenshots/guided-mobile.jpg" alt="Modo guiado de LiftTrack en móvil" width="330">
</p>

### Evolución de un ejercicio

<p align="center">
  <img src="docs/screenshots/progress-desktop.png" alt="Progreso del press banca en LiftTrack" width="100%">
</p>

### Historial de sesiones

<p align="center">
  <img src="docs/screenshots/sessions-desktop.png" alt="Sesiones guardadas en LiftTrack" width="100%">
</p>

### Sincronización y copias de seguridad

<p align="center">
  <img src="docs/screenshots/settings-data-desktop.png" alt="Sincronización y copias de seguridad en LiftTrack" width="100%">
</p>

## Tecnologías

| Área | Tecnología |
|---|---|
| Interfaz | React, TypeScript |
| Herramientas de desarrollo | Vite |
| Estilos | Tailwind CSS |
| Autenticación | Supabase Auth |
| Base de datos | Supabase PostgreSQL |
| Seguridad | Row Level Security |
| Despliegue | Vercel |
| Aplicación instalable | PWA |
| Persistencia auxiliar | `localStorage` / almacenamiento local |

## Arquitectura

LiftTrack utiliza React y TypeScript en el frontend, Supabase para autenticación y persistencia de datos, y Vercel para el despliegue.

La aplicación mantiene sincronizadas la vista completa y el modo guiado, conserva borradores de entrenamiento en curso y separa los borradores de las sesiones definitivas para que no afecten al historial ni a las estadísticas hasta que el entrenamiento se guarda.



## Estado del proyecto

LiftTrack es una aplicación funcional, desplegada y utilizada en entrenamientos reales. Las funcionalidades principales están implementadas y el proyecto continúa evolucionando a partir del uso práctico.



## Demo

La aplicación está disponible en:

**https://lifttrack-alpha.vercel.app/**

## Autor

Desarrollado por **Javier Domínguez Sabido**.

- GitHub: https://github.com/JavierDominguezSabido
- LinkedIn: https://www.linkedin.com/in/javierdominguezsabido/
