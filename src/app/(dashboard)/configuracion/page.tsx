// Página: Configuración del sistema (solo administrador)
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Users, MessageSquare, Bell, Calendar, Shield, Cpu, Server, BookOpen } from 'lucide-react'

export const metadata = {
  title: 'Configuración | CALA ASOCIADOS',
}

export default async function ConfiguracionPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'administrador') {
    redirect('/?error=sin_permisos')
  }

  const CONFIG_SECTIONS = [
    {
      href: '/configuracion/usuarios',
      title: 'Gestión de Usuarios',
      description: 'Crear y administrar contadores y clientes del sistema',
      icon: Users,
      color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    },
    {
      href: '/configuracion/whatsapp',
      title: 'Configuración WhatsApp',
      description: 'Plantillas de mensajes, credenciales API y número de envío',
      icon: MessageSquare,
      color: 'bg-green-500/10 text-green-600 dark:text-green-400',
    },
    {
      href: '/recordatorios/configuracion',
      title: 'Recordatorios Automáticos',
      description: 'Días de antelación, frecuencia y destinatarios',
      icon: Bell,
      color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    },
    {
      href: '/calendario',
      title: 'Calendario Tributario',
      description: 'Ver y actualizar fechas de vencimiento DIAN',
      icon: Calendar,
      color: 'bg-primary/10 text-primary',
    },
    {
      href: '/chatbot',
      title: 'AsistenteConta IA',
      description: 'Ver conversaciones y agregar preguntas frecuentes',
      icon: Cpu,
      color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
    },
    {
      href: '/configuracion/faqs',
      title: 'Base de Conocimiento',
      description: 'Gestionar FAQs que usa el chatbot para responder consultas',
      icon: BookOpen,
      color: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
    },
    {
      href: '/configuracion/sistema',
      title: 'Estado del Sistema',
      description: 'Variables de entorno, enviar recordatorios manualmente y diagnóstico',
      icon: Server,
      color: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
    },
  ]

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">
          Configuración del Sistema
        </h1>
        <p className="text-muted-foreground mt-1">
          Administra todos los parámetros de CALA ASOCIADOS
        </p>
      </div>

      {/* Banner de administrador */}
      <div className="flex items-center gap-3 p-4 bg-primary/5 border border-primary/20 rounded-xl">
        <Shield className="w-5 h-5 text-primary flex-shrink-0" aria-hidden="true" />
        <p className="text-sm text-foreground">
          Estás en el panel de <strong>administrador</strong>. Los cambios afectan a todo el sistema.
        </p>
      </div>

      {/* Secciones de configuración */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {CONFIG_SECTIONS.map((section) => {
          const Icon = section.icon
          return (
            <Link
              key={section.href}
              href={section.href}
              className="flex items-start gap-4 p-5 bg-card border border-border rounded-xl hover:bg-muted/30 hover:border-primary/30 transition-all group"
            >
              <div
                className={`p-3 rounded-xl flex-shrink-0 ${section.color} group-hover:scale-110 transition-transform`}
              >
                <Icon className="w-5 h-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-foreground group-hover:text-primary transition-colors">
                  {section.title}
                </p>
                <p className="text-sm text-muted-foreground mt-1 leading-snug">
                  {section.description}
                </p>
              </div>
            </Link>
          )
        })}
      </div>

      {/* Info de versión */}
      <div className="p-4 bg-muted/30 border border-border rounded-xl text-center">
        <p className="text-xs text-muted-foreground">
          CALA ASOCIADOS v1.0.0 — Sistema de Gestión Contable con IA
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Stack: Next.js 14 · Supabase · Groq (Llama 3.3) · Vercel
        </p>
      </div>
    </div>
  )
}
