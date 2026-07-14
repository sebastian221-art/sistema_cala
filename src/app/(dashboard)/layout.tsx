// src/app/(dashboard)/layout.tsx
// Layout principal del dashboard con Sidebar y Topbar
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'
import { Providers } from '@/components/layout/Providers'
import { UserRole } from '@/types'
import { headers } from 'next/headers'

// Títulos de página por ruta
function getPageTitle(pathname: string): string {
  const titles: Record<string, string> = {
    '/': 'Panel',
    '/motor-contable': 'Motor Contable',
    '/formulario-1647': 'Formulario 1647',
    '/consolidacion-iva': 'Consolidación IVA',
    '/configuracion': 'Configuración del Sistema',
  }

  if (titles[pathname]) return titles[pathname]

  // Coincidencia por prefijo (rutas anidadas)
  for (const [ruta, titulo] of Object.entries(titles)) {
    if (ruta !== '/' && pathname.startsWith(ruta)) return titulo
  }

  return 'CALA ASOCIADOS'
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  // Verificar sesión activa
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Obtener perfil del usuario con rol
  const { data: profile } = await supabase
    .from('profiles')
    .select('nombre, apellido, role, activo')
    .eq('id', user.id)
    .single()

  if (!profile || !profile.activo) {
    redirect('/login?error=cuenta_inactiva')
  }

  const userName = `${profile.nombre} ${profile.apellido}`.trim()
  const userRole = profile.role as UserRole

  // Obtener pathname desde headers (inyectado por el middleware)
  const headersList = await headers()
  const pathname = headersList.get('x-pathname') ?? '/'

  return (
    <Providers>
      <div className="flex min-h-screen bg-background">
        {/* Sidebar fijo */}
        <Sidebar userRole={userRole} userName={userName} />

        {/* Contenido principal */}
        <div className="flex-1 flex flex-col min-h-screen ml-64 transition-all duration-300">
          <Topbar
            title={getPageTitle(pathname)}
            userName={userName}
            userRole={userRole}
          />

          {/* Área de contenido */}
          <main
            className="flex-1 p-6 animate-fade-in"
            role="main"
            id="main-content"
          >
            {children}
          </main>
        </div>
      </div>
    </Providers>
  )
}