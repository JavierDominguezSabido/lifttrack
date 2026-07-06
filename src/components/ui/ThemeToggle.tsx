import { Moon, Sun } from 'lucide-react'
import { useState } from 'react'

type Theme = 'light' | 'dark'

const STORAGE_KEY = 'lifttrack:theme'

function getCurrentTheme(): Theme {
  if (typeof document === 'undefined') return 'light'
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.documentElement.dataset.theme = theme
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#0a0f1a' : '#f6f7f9')
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch (error) {
    console.error('[theme] No se pudo guardar la preferencia de tema:', error)
  }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getCurrentTheme)

  function selectTheme(nextTheme: Theme) {
    applyTheme(nextTheme)
    setTheme(nextTheme)
  }

  return (
    <div
      className="flex rounded-xl border border-control bg-surface p-1 shadow-sm"
      role="group"
      aria-label="Tema de la aplicación"
    >
      <button
        type="button"
        onClick={() => selectTheme('light')}
        aria-pressed={theme === 'light'}
        title="Modo claro"
        className={`flex size-11 items-center justify-center gap-1.5 rounded-lg text-xs font-bold transition sm:w-auto sm:px-2.5 ${
          theme === 'light'
            ? 'bg-brand-soft text-brand'
            : 'text-subtle hover:bg-muted hover:text-ink'
        }`}
      >
        <Sun className="size-4" aria-hidden="true" />
        <span className="hidden md:inline">Claro</span>
        <span className="sr-only md:hidden">Modo claro</span>
      </button>
      <button
        type="button"
        onClick={() => selectTheme('dark')}
        aria-pressed={theme === 'dark'}
        title="Modo oscuro"
        className={`flex size-11 items-center justify-center gap-1.5 rounded-lg text-xs font-bold transition sm:w-auto sm:px-2.5 ${
          theme === 'dark'
            ? 'bg-brand-soft text-brand'
            : 'text-subtle hover:bg-muted hover:text-ink'
        }`}
      >
        <Moon className="size-4" aria-hidden="true" />
        <span className="hidden md:inline">Oscuro</span>
        <span className="sr-only md:hidden">Modo oscuro</span>
      </button>
    </div>
  )
}
