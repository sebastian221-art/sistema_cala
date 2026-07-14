'use client'

// Botón para exportar el calendario tributario a PDF
import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { TaxCalendarEntry } from '@/types'

interface CalendarioExportButtonProps {
  eventos: TaxCalendarEntry[]
  año: number
}

export function CalendarioExportButton({ eventos, año }: CalendarioExportButtonProps) {
  const [exporting, setExporting] = useState(false)

  const handleExport = async () => {
    if (eventos.length === 0) {
      toast.error('No hay eventos para exportar')
      return
    }
    setExporting(true)
    try {
      const { exportCalendarioTributarioPDF } = await import('@/lib/pdf-export')
      await exportCalendarioTributarioPDF(eventos, año)
      toast.success(`Calendario ${año} exportado en PDF`)
    } catch {
      toast.error('Error al generar el PDF')
    } finally {
      setExporting(false)
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={exporting || eventos.length === 0}
      className="inline-flex items-center gap-2 px-4 py-2 border border-border bg-card text-foreground rounded-xl text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
      title="Exportar calendario a PDF"
    >
      {exporting
        ? <Loader2 className="w-4 h-4 animate-spin" />
        : <Download className="w-4 h-4" />
      }
      Exportar PDF
    </button>
  )
}
