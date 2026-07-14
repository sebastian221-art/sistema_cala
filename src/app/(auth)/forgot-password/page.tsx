'use client'

// Página de recuperación de contraseña
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/client'
import { TrendingUp, ArrowLeft, CheckCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'

const schema = z.object({
  email: z.string().email('Ingresa un email válido'),
})

type FormData = z.infer<typeof schema>

export default function ForgotPasswordPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  const onSubmit = async (data: FormData) => {
    setIsLoading(true)
    try {
      const supabase = createClient()
      await supabase.auth.resetPasswordForEmail(data.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      setSent(true)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
            <TrendingUp className="w-6 h-6 text-primary-foreground" aria-hidden="true" />
          </div>
          <p className="font-display font-bold text-foreground text-xl">CALA ASOCIADOS</p>
        </div>

        {sent ? (
          <div className="text-center space-y-4">
            <CheckCircle className="w-14 h-14 text-success mx-auto" aria-hidden="true" />
            <h2 className="text-2xl font-display font-semibold text-foreground">
              Correo enviado
            </h2>
            <p className="text-muted-foreground">
              Revisa tu bandeja de entrada y sigue las instrucciones para restablecer tu contraseña.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 text-primary hover:underline text-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              Volver al inicio de sesión
            </Link>
          </div>
        ) : (
          <>
            <h2 className="text-2xl font-display font-semibold text-foreground mb-2">
              Recuperar contraseña
            </h2>
            <p className="text-muted-foreground mb-8">
              Ingresa tu email y te enviaremos un enlace para restablecer tu contraseña.
            </p>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-foreground mb-2">
                  Correo electrónico
                </label>
                <input
                  id="email"
                  type="email"
                  {...register('email')}
                  className={cn(
                    'w-full px-4 py-3 rounded-xl border bg-background text-foreground',
                    'focus:outline-none focus:ring-2 focus:ring-ring',
                    errors.email ? 'border-danger' : 'border-border'
                  )}
                  placeholder="tu@email.com"
                />
                {errors.email && (
                  <p className="mt-1.5 text-xs text-danger">{errors.email.message}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:bg-primary-light transition-colors disabled:opacity-60"
              >
                {isLoading ? 'Enviando...' : 'Enviar enlace de recuperación'}
              </button>
            </form>

            <Link
              href="/login"
              className="flex items-center justify-center gap-2 mt-6 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Volver al inicio de sesión
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
