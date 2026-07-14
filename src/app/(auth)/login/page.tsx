'use client'

// Página de inicio de sesión de CALA ASOCIADOS
import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/client'
import { Eye, EyeOff, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import Image from 'next/image'
import { toast } from 'sonner'

// Schema de validación con Zod
const loginSchema = z.object({
  email: z.string().email('Ingresa un email válido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
})

type LoginFormData = z.infer<typeof loginSchema>

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const redirectTo = searchParams.get('redirectTo') ?? '/'
  const errorParam = searchParams.get('error')

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      })

      if (authError) {
        if (authError.message.includes('Invalid login credentials')) {
          setError('Credenciales incorrectas. Verifica tu email y contraseña.')
        } else {
          setError('Error al iniciar sesión. Intenta de nuevo.')
        }
        return
      }

      toast.success('Sesión iniciada correctamente')
      router.push(redirectTo)
      router.refresh()
    } catch {
      setError('Error inesperado. Por favor intenta de nuevo.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Logo móvil */}
        <div className="lg:hidden flex items-center mb-8">
          <Image
            src="/cala-completo.png"
            alt="CALA ASOCIADOS"
            width={170}
            height={48}
            priority
          />
        </div>

        <h2 className="text-2xl font-display font-semibold text-foreground mb-2">
          Iniciar sesión
        </h2>
        <p className="text-muted-foreground mb-8">
          Ingresa tus credenciales para acceder al sistema
        </p>

        {/* Error de cuenta inactiva */}
        {errorParam === 'cuenta_inactiva' && (
          <div className="flex items-start gap-3 p-4 bg-danger/10 text-danger rounded-xl mb-6" role="alert">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-sm">Tu cuenta está inactiva. Contacta al administrador.</p>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
          {/* Email */}
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-foreground mb-2"
            >
              Correo electrónico
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              {...register('email')}
              className={cn(
                'w-full px-4 py-3 rounded-xl border bg-background text-foreground',
                'placeholder:text-muted-foreground transition-colors',
                'focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent',
                errors.email ? 'border-danger' : 'border-border'
              )}
              placeholder="contador@empresa.com"
              aria-describedby={errors.email ? 'email-error' : undefined}
              aria-invalid={errors.email ? 'true' : 'false'}
            />
            {errors.email && (
              <p id="email-error" className="mt-1.5 text-xs text-danger" role="alert">
                {errors.email.message}
              </p>
            )}
          </div>

          {/* Contraseña */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label
                htmlFor="password"
                className="block text-sm font-medium text-foreground"
              >
                Contraseña
              </label>
              <Link
                href="/forgot-password"
                className="text-xs text-primary hover:underline"
              >
                ¿Olvidaste tu contraseña?
              </Link>
            </div>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                {...register('password')}
                className={cn(
                  'w-full px-4 py-3 pr-12 rounded-xl border bg-background text-foreground',
                  'placeholder:text-muted-foreground transition-colors',
                  'focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent',
                  errors.password ? 'border-danger' : 'border-border'
                )}
                placeholder="••••••••"
                aria-describedby={errors.password ? 'password-error' : undefined}
                aria-invalid={errors.password ? 'true' : 'false'}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPassword ? (
                  <EyeOff className="w-5 h-5" aria-hidden="true" />
                ) : (
                  <Eye className="w-5 h-5" aria-hidden="true" />
                )}
              </button>
            </div>
            {errors.password && (
              <p id="password-error" className="mt-1.5 text-xs text-danger" role="alert">
                {errors.password.message}
              </p>
            )}
          </div>

          {/* Error general */}
          {error && (
            <div className="flex items-start gap-3 p-4 bg-danger/10 text-danger rounded-xl" role="alert">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          {/* Botón de submit */}
          <button
            type="submit"
            disabled={isLoading}
            className={cn(
              'w-full py-3 px-6 rounded-xl font-semibold text-sm transition-all duration-200',
              'bg-primary text-primary-foreground',
              'hover:bg-primary-light active:scale-95',
              'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
              'disabled:opacity-60 disabled:cursor-not-allowed disabled:scale-100'
            )}
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <svg
                  className="animate-spin h-4 w-4"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Iniciando sesión...
              </span>
            ) : (
              'Iniciar sesión'
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          ¿Necesitas acceso?{' '}
          <span className="text-primary">Contacta a tu administrador</span>
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex bg-background">
      {/* Panel izquierdo - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary flex-col items-center justify-center p-12">
        <div className="max-w-md text-center">
          {/* Logo en contenedor blanco para que los colores se vean correctamente */}
          <div className="mb-8 flex justify-center">
            <div className="logo-container px-4 py-2">
              <Image
                src="/cala-completo.png"
                alt="CALA ASOCIADOS"
                width={200}
                height={57}
                priority
              />
            </div>
          </div>
          <p className="text-white/70 text-lg leading-relaxed">
            Sistema de gestión contable empresarial con inteligencia artificial para
            contadores y sus clientes en Colombia.
          </p>

          <div className="mt-10 grid grid-cols-2 gap-4 text-left">
            {[
              { title: 'Obligaciones DIAN', desc: 'Seguimiento automático de vencimientos tributarios' },
              { title: 'Alertas WhatsApp', desc: 'Recordatorios automáticos para clientes y contadores' },
              { title: 'IA Financiera', desc: 'Análisis y predicciones con Groq + Llama 3.3' },
              { title: 'Estados Financieros', desc: 'Carga de Excel y comparativos automáticos' },
            ].map((feature) => (
              <div key={feature.title} className="bg-white/10 rounded-xl p-4">
                <p className="text-white font-semibold text-sm">{feature.title}</p>
                <p className="text-white/60 text-xs mt-1">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Panel derecho - Formulario */}
      <Suspense fallback={<div className="flex-1 flex items-center justify-center"><div className="skeleton h-96 w-full max-w-md" /></div>}>
        <LoginForm />
      </Suspense>
    </div>
  )
}
