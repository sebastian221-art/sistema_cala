'use client'

// Botón de exportar reporte general a PDF
import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface ExportButtonProps {
  totalClientes: number
  obligacionesActivas: number
  estadosFinancieros: number
  topObligaciones: Array<[string, number]>
  clientesPorTipo: { persona_juridica: number; persona_natural: number }
}

export function ExportReporteButton(props: ExportButtonProps) {
  const [exporting, setExporting] = useState(false)

  const handleExport = async () => {
    setExporting(true)
    try {
      const { exportReporteGeneralPDF } = await import('@/lib/pdf-export')
      await exportReporteGeneralPDF(props)
      toast.success('Reporte exportado exitosamente')
    } catch {
      toast.error('Error al generar el PDF')
    } finally {
      setExporting(false)
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={exporting}
      className="inline-flex items-center gap-2 px-4 py-2.5 border border-border bg-card text-foreground rounded-xl font-medium text-sm hover:bg-muted transition-colors disabled:opacity-50"
    >
      {exporting
        ? <Loader2 className="w-4 h-4 animate-spin" />
        : <Download className="w-4 h-4" />
      }
      Exportar PDF
    </button>
  )
}
