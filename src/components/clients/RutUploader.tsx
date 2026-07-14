'use client'

// Componente para subir y procesar el RUT del cliente
import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, FileText, CheckCircle, AlertCircle, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ExtractedRutData } from '@/types'
import { toast } from 'sonner'

interface RutUploaderProps {
  onDataExtracted: (data: ExtractedRutData) => void
  className?: string
}

type UploadState = 'idle' | 'uploading' | 'processing' | 'done' | 'error'

export function RutUploader({ onDataExtracted, className }: RutUploaderProps) {
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [fileName, setFileName] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [confianza, setConfianza] = useState<number | null>(null)

  const processFile = async (file: File) => {
    setFileName(file.name)
    setUploadState('uploading')
    setErrorMessage(null)
    setProgress(20)

    try {
      const formData = new FormData()
      formData.append('file', file)

      setProgress(40)
      setUploadState('processing')

      const response = await fetch('/api/rut/parse', {
        method: 'POST',
        body: formData,
      })

      setProgress(80)

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error ?? 'Error al procesar el RUT')
      }

      const result: { data: ExtractedRutData } = await response.json()

      setProgress(100)
      setUploadState('done')
      setConfianza(result.data.confianza ?? null)
      onDataExtracted(result.data)

      const confianzaMsg =
        (result.data.confianza ?? 0) >= 80
          ? 'con alta confianza'
          : 'revisa los datos extraídos'

      toast.success(`RUT procesado correctamente (${confianzaMsg})`)
    } catch (error) {
      setUploadState('error')
      const msg = error instanceof Error ? error.message : 'Error al procesar el archivo'
      setErrorMessage(msg)
      toast.error(msg)
    }
  }

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const file = acceptedFiles[0]
      if (file) {
        processFile(file)
      }
    },
    [onDataExtracted]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
    },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024, // 10MB
    disabled: uploadState === 'uploading' || uploadState === 'processing',
    onDropRejected: (rejectedFiles) => {
      const error = rejectedFiles[0]?.errors[0]
      if (error?.code === 'file-too-large') {
        toast.error('El archivo no puede superar 10MB')
      } else if (error?.code === 'file-invalid-type') {
        toast.error('Solo se aceptan archivos PDF, JPG o PNG')
      }
    },
  })

  const reset = () => {
    setUploadState('idle')
    setFileName(null)
    setProgress(0)
    setErrorMessage(null)
    setConfianza(null)
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* Zona de drop */}
      <div
        {...getRootProps()}
        className={cn(
          'relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 cursor-pointer',
          isDragActive && 'border-primary bg-primary/5',
          uploadState === 'idle' && !isDragActive && 'border-border hover:border-primary/50 hover:bg-muted/30',
          (uploadState === 'uploading' || uploadState === 'processing') && 'border-primary/50 bg-primary/5 cursor-not-allowed',
          uploadState === 'done' && 'border-success/50 bg-success/5',
          uploadState === 'error' && 'border-danger/50 bg-danger/5'
        )}
        role="button"
        aria-label="Zona de carga de archivo RUT"
      >
        <input {...getInputProps()} aria-hidden="true" />

        {uploadState === 'idle' && (
          <div className="space-y-3">
            <div className="w-12 h-12 bg-muted rounded-xl flex items-center justify-center mx-auto">
              <Upload className="w-6 h-6 text-muted-foreground" aria-hidden="true" />
            </div>
            <div>
              <p className="font-medium text-foreground">
                {isDragActive ? 'Suelta el archivo aquí' : 'Sube el RUT del cliente'}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Arrastra y suelta, o haz clic para seleccionar
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                PDF, JPG o PNG • Máximo 10MB
              </p>
            </div>
          </div>
        )}

        {(uploadState === 'uploading' || uploadState === 'processing') && (
          <div className="space-y-4">
            <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto" aria-hidden="true" />
            <div>
              <p className="font-medium text-foreground">
                {uploadState === 'uploading' ? 'Subiendo archivo...' : 'Procesando con IA...'}
              </p>
              <p className="text-sm text-muted-foreground mt-1">{fileName}</p>
            </div>
            {/* Barra de progreso */}
            <div className="w-full max-w-xs mx-auto bg-muted rounded-full h-1.5" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
              <div
                className="bg-primary h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {uploadState === 'done' && (
          <div className="space-y-3">
            <CheckCircle className="w-10 h-10 text-success mx-auto" aria-hidden="true" />
            <div>
              <p className="font-medium text-foreground">
                RUT procesado exitosamente
              </p>
              {fileName && (
                <p className="text-sm text-muted-foreground mt-1">{fileName}</p>
              )}
              {confianza !== null && (
                <p className="text-xs mt-2">
                  Confianza de extracción:{' '}
                  <span
                    className={cn(
                      'font-semibold',
                      confianza >= 80 ? 'text-success' :
                      confianza >= 50 ? 'text-warning' : 'text-danger'
                    )}
                  >
                    {confianza}%
                  </span>
                </p>
              )}
            </div>
          </div>
        )}

        {uploadState === 'error' && (
          <div className="space-y-3">
            <AlertCircle className="w-10 h-10 text-danger mx-auto" aria-hidden="true" />
            <div>
              <p className="font-medium text-danger">Error al procesar el archivo</p>
              {errorMessage && (
                <p className="text-sm text-muted-foreground mt-1">{errorMessage}</p>
              )}
            </div>
          </div>
        )}

        {/* Botón de reset */}
        {(uploadState === 'done' || uploadState === 'error') && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              reset()
            }}
            className="absolute top-3 right-3 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Cargar otro archivo"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Instrucciones */}
      <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg">
        <FileText className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" aria-hidden="true" />
        <p className="text-xs text-muted-foreground">
          El sistema extraerá automáticamente el NIT, razón social, actividad económica y
          responsabilidades tributarias. Podrás revisar y editar los datos antes de guardar.
        </p>
      </div>
    </div>
  )
}
