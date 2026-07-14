'use client'

// Botón para importar el calendario tributario desde el Boletín CALA ASOCIADOS
import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  año: number
}

export function CalendarioSeedButton({ año }: Props) {
  const [isLoading, setIsLoading] = useState(false)

  const importCalendar = async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/admin/calendar/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error al importar')
      toast.success(json.data?.message ?? `Calendario ${año} importado`)
      // Recargar página para mostrar los nuevos datos
      window.location.reload()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al importar')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <button
      onClick={importCalendar}
      disabled={isLoading}
      className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary-light transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex-shrink-0"
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Download className="w-4 h-4" />
      )}
      {isLoading ? 'Importando...' : `Importar calendario ${año}`}
    </button>
  )
}
