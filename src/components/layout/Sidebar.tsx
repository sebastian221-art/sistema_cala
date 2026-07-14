'use client'

// Sidebar fijo con navegación principal de CALA ASOCIADOS
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { UserRole } from '@/types'
import {
  LayoutDashboard,
  LogOut,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Receipt,
  Calculator,
  Settings,
} from 'lucide-react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { useState } from 'react'

interface NavItem {
  href: string
  label: string
  icon: React.ElementType
  roles: UserRole[]
}

const NAV_ITEMS: NavItem[] = [
  {
    href: '/',
    label: 'Panel',
    icon: LayoutDashboard,
    roles: ['administrador', 'contador', 'cliente'],
  },
  {
    href: '/motor-contable',
    label: 'Motor Contable',
    icon: FileSpreadsheet,
    roles: ['administrador', 'contador'],
  },
  {
    href: '/formulario-1647',
    label: 'Formulario 1647',
    icon: Receipt,
    roles: ['administrador', 'contador'],
  },
  {
    href: '/consolidacion-iva',
    label: 'Consolidación IVA',
    icon: Calculator,
    roles: ['administrador', 'contador'],
  },
  {
    href: '/configuracion',
    label: 'Configuración',
    icon: Settings,
    roles: ['administrador'],
  },
]

interface SidebarProps {
  userRole: UserRole
  userName: string
}

export function Sidebar({ userRole, userName }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  // Filtrar items según el rol del usuario
  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(userRole))

  const handleLogout = async () => {
    setLoggingOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-screen flex flex-col z-50 transition-all duration-300',
        'bg-sidebar border-r border-sidebar-border',
        collapsed ? 'w-16' : 'w-64'
      )}
      aria-label="Navegación principal"
    >
      {/* Logo */}
      <div className="flex items-center h-16 px-3 border-b border-sidebar-border">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <Image
            src="/cala-icono.svg"
            alt="CALA"
            width={34}
            height={34}
            className="flex-shrink-0"
            priority
          />
          {!collapsed && (
            <div className="min-w-0 leading-tight">
              <p className="text-white font-display font-bold text-lg tracking-wide">
                CALA
              </p>
              <p className="text-white/60 text-[10px] font-medium tracking-[0.2em] uppercase">
                Asociados
              </p>
            </div>
          )}
        </div>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="ml-auto p-1.5 rounded-md text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Navegación principal */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1" role="navigation">
        {visibleItems.map((item) => {
          const Icon = item.icon
          const isActive =
            item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href)

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'sidebar-nav-item relative',
                isActive && 'active',
                collapsed && 'justify-center px-2'
              )}
              aria-current={isActive ? 'page' : undefined}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* Footer: usuario + logout */}
      <div className="border-t border-sidebar-border p-3">
        {!collapsed && (
          <div className="mb-2 px-2">
            <p className="text-white/90 text-sm font-medium truncate">{userName}</p>
            <p className="text-white/50 text-xs capitalize">{userRole}</p>
          </div>
        )}
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className={cn(
            'sidebar-nav-item w-full text-white/60 hover:text-red-300 hover:bg-red-500/10',
            collapsed && 'justify-center px-2'
          )}
          aria-label="Cerrar sesión"
          title={collapsed ? 'Cerrar sesión' : undefined}
        >
          <LogOut className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
          {!collapsed && <span>{loggingOut ? 'Saliendo...' : 'Cerrar sesión'}</span>}
        </button>
      </div>
    </aside>
  )
}