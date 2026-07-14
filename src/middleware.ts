// Middleware de Next.js para protección de rutas por rol
import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

// Rutas públicas (sin autenticación requerida)
const PUBLIC_ROUTES = ['/login', '/forgot-password', '/api/webhooks/whatsapp']

// Rutas solo para administrador
const ADMIN_ONLY_ROUTES = ['/configuracion', '/reportes']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Permitir rutas públicas
  if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.next()
  }

  // Permitir rutas de assets y API de cron
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/cron') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  const { supabaseResponse, user, supabase } = await updateSession(request)

  // Redirigir al login si no hay sesión
  if (!user) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Obtener rol del usuario desde la tabla profiles
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, activo')
    .eq('id', user.id)
    .single()

  // Si el usuario está inactivo, redirigir al login
  if (!profile || !profile.activo) {
    return NextResponse.redirect(new URL('/login?error=cuenta_inactiva', request.url))
  }

  const userRole = profile.role

  // Proteger rutas de administrador
  if (ADMIN_ONLY_ROUTES.some((route) => pathname.startsWith(route))) {
    if (userRole !== 'administrador') {
      return NextResponse.redirect(new URL('/?error=sin_permisos', request.url))
    }
  }

  // Headers con info del usuario para Server Components
  const response = supabaseResponse
  response.headers.set('x-user-id', user.id)
  response.headers.set('x-user-role', userRole)
  response.headers.set('x-pathname', pathname)

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
