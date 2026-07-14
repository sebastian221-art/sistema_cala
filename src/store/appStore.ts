// Store global de Zustand para estado de la aplicación
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { UserRole } from '@/types'

interface AppState {
  // Estado del usuario actual
  userRole: UserRole | null
  userId: string | null
  userName: string | null

  // Preferencias de UI
  sidebarCollapsed: boolean
  compactMode: boolean

  // Notificaciones no leídas
  unreadNotifications: number

  // Setters
  setUser: (role: UserRole, id: string, name: string) => void
  clearUser: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setCompactMode: (compact: boolean) => void
  setUnreadNotifications: (count: number) => void
  decrementNotifications: () => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      userRole: null,
      userId: null,
      userName: null,
      sidebarCollapsed: false,
      compactMode: false,
      unreadNotifications: 0,

      setUser: (role, id, name) =>
        set({ userRole: role, userId: id, userName: name }),

      clearUser: () =>
        set({ userRole: null, userId: null, userName: null }),

      setSidebarCollapsed: (collapsed) =>
        set({ sidebarCollapsed: collapsed }),

      setCompactMode: (compact) =>
        set({ compactMode: compact }),

      setUnreadNotifications: (count) =>
        set({ unreadNotifications: count }),

      decrementNotifications: () =>
        set((state) => ({
          unreadNotifications: Math.max(0, state.unreadNotifications - 1),
        })),
    }),
    {
      name: 'contaflow-app-state',
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        compactMode: state.compactMode,
      }),
    }
  )
)
