# LiftTrack

Primera versión de una aplicación instalable para registrar entrenamientos de fuerza. Funciona con datos mock y guarda las nuevas sesiones en `localStorage`.

## Desarrollo

```bash
npm install
npm run dev
```

## Supabase (preparado, no activo)

LiftTrack sigue usando `localStorage` por defecto. Para preparar un entorno:

1. Copia `.env.example` a `.env.local`.
2. Completa `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
3. Ejecuta `docs/supabase-schema.sql` en tu proyecto Supabase.

Configurar las variables no cambia todavía el proveedor activo ni migra datos locales.

## Estructura

- `src/components`: componentes de layout, interfaz y registro.
- `src/pages`: dashboard, rutina, entrenamiento e historial.
- `src/types`: modelos TypeScript del dominio.
- `src/data`: ejercicios, rutinas y sesiones mock.
- `src/services/mock`: persistencia local de esta versión.
- `src/services/supabase`: cliente y contrato preparados para la siguiente fase.
- `src/context`: estado compartido de sesiones.

## Supabase (siguiente fase)

Copia `.env.example` a `.env.local` y completa las variables cuando exista el proyecto de Supabase. El cliente no se inicializa si faltan, por lo que esta versión no requiere credenciales.
