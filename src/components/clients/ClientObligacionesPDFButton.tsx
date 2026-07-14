'use client'

// Botón para exportar las obligaciones de un cliente a PDF
import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface Obligation {
  tipo_impuesto: string
  periodicidad: string
  regimen?: string
  fecha_inicio: string
  activo: boolean
  notas?: string
}

interface ClientObligacionesPDFButtonProps {
  clientName: string
  clientNit: string
  obligations: Obligation[]
}

export function ClientObligacionesPDFButton({
  clientName,
  clientNit,
  obligations,
}: ClientObligacionesPDFButtonProps) {
  const [exporting, setExporting] = useState(false)

  const handleExport = async () => {
    setExporting(true)
    try {
      // Fetch próximos vencimientos del calendario
      const res = await fetch(`/api/clients/${encodeURIComponent(clientNit)}/upcoming-dates`)
      const upcomingDates = res.ok ? (await res.json()).data ?? [] : []

      const { exportClientObligacionesPDF } = await import('@/lib/pdf-export')
      await exportClientObligacionesPDF(clientName, clientNit, obligations, upcomingDates)
      toast.success('Resumen de obligaciones exportado')
    } catch {
      toast.error('Error al generar el PDF')
    } finally {
      setExporting(false)
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={exporting || obligations.length === 0}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-border bg-background text-foreground rounded-xl text-xs font-medium hover:bg-muted transition-colors disabled:opacity-50"
      title="Exportar resumen de obligaciones a PDF"
    >
      {exporting
        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
        : <Download className="w-3.5 h-3.5" />
      }
      Exportar PDF
    </button>
  )
}
