'use client'

// Topbar superior con título de sección, toggle de tema y usuario
import { useState, useEffect } from 'react'
import { Sun, Moon, Monitor, ChevronDown } from 'lucide-react'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'
import { UserRole } from '@/types'
import { getInitials } from '@/lib/utils'

interface TopbarProps {
  title: string
  userName: string
  userRole: UserRole
}

export function Topbar({ title, userName, userRole }: TopbarProps) {
  const { theme, setTheme } = useTheme()
  const [themeMenuOpen, setThemeMenuOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const themeOptions = [
    { label: 'Claro', value: 'light', icon: Sun },
    { label: 'Oscuro', value: 'dark', icon: Moon },
    { label: 'Sistema', value: 'system', icon: Monitor },
  ]

  // Evitar hidratación: usar Monitor como icono neutro hasta que el cliente monte
  const ThemeIcon = !mounted
    ? Monitor
    : theme === 'dark'
    ? Moon
    : theme === 'light'
    ? Sun
    : Monitor

  return (
    <header
      className="h-16 bg-card border-b border-border flex items-center px-6 gap-4 sticky top-0 z-40"
      role="banner"
    >
      {/* Título de la sección actual */}
      <div className="flex-1 min-w-0">
        <h1 className="text-xl font-display font-semibold text-foreground truncate">
          {title}
        </h1>
      </div>

      {/* Toggle de tema */}
      <div className="relative">
        <button
          onClick={() => setThemeMenuOpen(!themeMenuOpen)}
          className="flex items-center gap-1.5 p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label="Cambiar tema"
          aria-expanded={themeMenuOpen}
        >
          <ThemeIcon className="w-5 h-5" aria-hidden="true" />
          <ChevronDown className="w-3 h-3" aria-hidden="true" />
        </button>

        {themeMenuOpen && (
          <div
            className="absolute right-0 top-full mt-2 w-36 bg-popover border border-border rounded-lg shadow-lg overflow-hidden"
            role="menu"
          >
            {themeOptions.map((option) => {
              const Icon = option.icon
              return (
                <button
                  key={option.value}
                  onClick={() => {
                    setTheme(option.value)
                    setThemeMenuOpen(false)
                  }}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors',
                    theme === option.value
                      ? 'bg-muted text-foreground font-medium'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                  role="menuitem"
                >
                  <Icon className="w-4 h-4" aria-hidden="true" />
                  {option.label}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Usuario */}
      <div className="flex items-center gap-2.5">
        <div className="hidden sm:block text-right leading-tight">
          <p className="text-sm font-medium text-foreground truncate max-w-40">
            {userName}
          </p>
          <p className="text-xs text-muted-foreground capitalize">{userRole}</p>
        </div>
        <div
          className="flex items-center justify-center w-9 h-9 rounded-full bg-primary text-primary-foreground text-sm font-semibold flex-shrink-0"
          aria-hidden="true"
        >
          {getInitials(userName)}
        </div>
      </div>
    </header>
  )
}