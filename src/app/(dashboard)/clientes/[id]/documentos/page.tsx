'use client'

// Página: Gestión documental del cliente — carpetas + control de visibilidad
import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Upload, Trash2, Download, Loader2,
  FolderOpen, Folder, Plus, X, File, Eye, EyeOff,
  ChevronRight, ChevronDown,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const CATEGORIAS: Record<string, { label: string; color: string; icon: string }> = {
  rut: { label: 'RUT', color: 'bg-blue-500/10 text-blue-700 dark:text-blue-400', icon: '🪪' },
  camara_comercio: { label: 'Cámara de Comercio', color: 'bg-green-500/10 text-green-700 dark:text-green-400', icon: '🏢' },
  renta: { label: 'Declaración Renta', color: 'bg-purple-500/10 text-purple-700 dark:text-purple-400', icon: '📋' },
  iva: { label: 'Declaración IVA', color: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400', icon: '📑' },
  retencion: { label: 'Retención en la Fuente', color: 'bg-amber-500/10 text-amber-700 dark:text-amber-400', icon: '📄' },
  ica: { label: 'Declaración ICA', color: 'bg-teal-500/10 text-teal-700 dark:text-teal-400', icon: '🏙️' },
  estados_financieros: { label: 'Estados Financieros', color: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400', icon: '📊' },
  contrato: { label: 'Contratos', color: 'bg-pink-500/10 text-pink-700 dark:text-pink-400', icon: '✍️' },
  otro: { label: 'Otros', color: 'bg-muted text-muted-foreground', icon: '📁' },
}

interface Document {
  id: string
  nombre: string
  categoria: string
  descripcion?: string
  file_url: string
  file_name: string
  file_size?: number
  file_type?: string
  periodo?: string
  storage_path?: string
  visible_to_client: boolean
  created_at: string
  uploaded_by?: { nombre: string; apellido: string }
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function FileTypeIcon({ type }: { type?: string }) {
  if (type?.includes('pdf')) return <span className="text-red-500 text-base">📕</span>
  if (type?.includes('image')) return <span className="text-blue-500 text-base">🖼️</span>
  if (type?.includes('sheet') || type?.includes('excel')) return <span className="text-green-600 text-base">📗</span>
  if (type?.includes('word') || type?.includes('document')) return <span className="text-blue-600 text-base">📘</span>
  return <File className="w-4 h-4 text-muted-foreground" />
}

export default function DocumentosPage() {
  const { id: clientId } = useParams<{ id: string }>()
  const [docs, setDocs] = useState<Document[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({})
  const [userRole, setUserRole] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const canUpload = userRole === 'administrador' || userRole === 'contador'
  const isContador = userRole === 'contador' || userRole === 'administrador'

  useEffect(() => {
    fetch('/api/auth/profile')
      .then((r) => r.json())
      .then(({ data }) => { if (data?.role) setUserRole(data.role) })
      .catch(() => {})
  }, [])

  const [form, setForm] = useState({
    nombre: '',
    categoria: 'rut' as keyof typeof CATEGORIAS,
    descripcion: '',
    periodo: '',
    file: null as File | null,
  })

  const loadDocs = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/documents`)
      if (res.ok) {
        const { data } = await res.json()
        const list: Document[] = data ?? []
        setDocs(list)
        // Abrir automáticamente carpetas que tienen documentos
        const initialOpen: Record<string, boolean> = {}
        list.forEach((d) => { initialOpen[d.categoria] = true })
        setOpenFolders(initialOpen)
      }
    } catch {
      toast.error('Error al cargar documentos')
    } finally {
      setIsLoading(false)
    }
  }, [clientId])

  useEffect(() => { loadDocs() }, [loadDocs])

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.file || !form.nombre) {
      toast.error('Selecciona un archivo y escribe el nombre')
      return
    }

    setUploading(true)
    try {
      const urlRes = await fetch(`/api/clients/${clientId}/documents/upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: form.file.name, fileType: form.file.type }),
      })
      const { data: urlData, error: urlError } = await urlRes.json()
      if (!urlRes.ok) throw new Error(urlError ?? 'Error al obtener URL de subida')

      const uploadRes = await fetch(urlData.signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': form.file.type || 'application/octet-stream' },
        body: form.file,
      })
      if (!uploadRes.ok) throw new Error('Error al subir el archivo')

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const fileUrl = `${supabaseUrl}/storage/v1/object/public/documentos/${urlData.storagePath}`

      const regRes = await fetch(`/api/clients/${clientId}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: form.nombre,
          categoria: form.categoria,
          descripcion: form.descripcion || undefined,
          periodo: form.periodo || undefined,
          file_url: fileUrl,
          file_name: form.file.name,
          file_size: form.file.size,
          file_type: form.file.type,
          storage_path: urlData.storagePath,
        }),
      })
      const { error: regError } = await regRes.json()
      if (!regRes.ok) throw new Error(regError ?? 'Error al registrar documento')

      toast.success('Documento subido correctamente')
      setForm({ nombre: '', categoria: 'rut', descripcion: '', periodo: '', file: null })
      if (fileInputRef.current) fileInputRef.current.value = ''
      setShowUpload(false)
      await loadDocs()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al subir documento')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (doc: Document) => {
    if (!confirm(`¿Eliminar "${doc.nombre}"? Esta acción no se puede deshacer.`)) return
    setDeletingId(doc.id)
    try {
      const res = await fetch(`/api/clients/${clientId}/documents?docId=${doc.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const { error } = await res.json()
        throw new Error(error)
      }
      setDocs((prev) => prev.filter((d) => d.id !== doc.id))
      toast.success('Documento eliminado')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al eliminar')
    } finally {
      setDeletingId(null)
    }
  }

  const handleToggleVisibility = async (doc: Document) => {
    setTogglingId(doc.id)
    try {
      const res = await fetch(`/api/clients/${clientId}/documents?docId=${doc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visible_to_client: !doc.visible_to_client }),
      })
      if (!res.ok) throw new Error('Error al cambiar visibilidad')
      setDocs((prev) =>
        prev.map((d) => d.id === doc.id ? { ...d, visible_to_client: !d.visible_to_client } : d)
      )
      toast.success(doc.visible_to_client ? 'Documento ocultado al cliente' : 'Documento visible para el cliente')
    } catch {
      toast.error('Error al cambiar visibilidad')
    } finally {
      setTogglingId(null)
    }
  }

  const toggleFolder = (cat: string) => {
    setOpenFolders((prev) => ({ ...prev, [cat]: !prev[cat] }))
  }

  // Agrupar docs por categoría
  const byCategory = Object.keys(CATEGORIAS).reduce<Record<string, Document[]>>((acc, cat) => {
    const items = docs.filter((d) => d.categoria === cat)
    if (items.length > 0) acc[cat] = items
    return acc
  }, {})

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href={`/clientes/${clientId}`}
          className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label="Volver al perfil del cliente"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-display font-bold text-foreground">Gestión Documental</h1>
          <p className="text-muted-foreground mt-1">
            {isContador
              ? 'Administra documentos y controla qué puede ver el cliente'
              : 'Documentos compartidos por tu contador'}
          </p>
        </div>
        {canUpload && (
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary-light transition-colors"
          >
            <Plus className="w-4 h-4" />
            Subir documento
          </button>
        )}
      </div>

      {/* Formulario de subida */}
      {showUpload && (
        <div className="bg-card border border-border rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-foreground flex items-center gap-2">
              <Upload className="w-4 h-4 text-primary" />
              Subir nuevo documento
            </h2>
            <button
              onClick={() => setShowUpload(false)}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleUpload} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Nombre del documento <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm"
                placeholder="Ej: RUT 2025"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Carpeta / Categoría <span className="text-danger">*</span>
              </label>
              <select
                value={form.categoria}
                onChange={(e) => setForm({ ...form, categoria: e.target.value as keyof typeof CATEGORIAS })}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm"
              >
                {Object.entries(CATEGORIAS).map(([key, { label, icon }]) => (
                  <option key={key} value={key}>{icon} {label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Período (opcional)
              </label>
              <input
                type="text"
                value={form.periodo}
                onChange={(e) => setForm({ ...form, periodo: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm"
                placeholder="Ej: 2025, 2025-1, Bimestre 1 2025"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Archivo <span className="text-danger">*</span>
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.zip"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null
                  setForm((f) => ({
                    ...f,
                    file,
                    nombre: f.nombre || (file ? file.name.replace(/\.[^.]+$/, '') : ''),
                  }))
                }}
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-sm file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-primary/10 file:text-primary"
                required
              />
              <p className="text-xs text-muted-foreground mt-1">PDF, Word, Excel, imágenes — máx. 20 MB</p>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Descripción (opcional)
              </label>
              <input
                type="text"
                value={form.descripcion}
                onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm"
                placeholder="Notas adicionales sobre el documento"
              />
            </div>

            <div className="sm:col-span-2 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowUpload(false)}
                className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={uploading}
                className={cn(
                  'flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium',
                  'hover:bg-primary-light transition-colors disabled:opacity-60 disabled:cursor-not-allowed'
                )}
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {uploading ? 'Subiendo...' : 'Subir documento'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Árbol de carpetas */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : docs.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <FolderOpen className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground font-medium">No hay documentos cargados aún</p>
          {canUpload && (
            <p className="text-sm text-muted-foreground mt-1">
              Haz clic en &quot;Subir documento&quot; para agregar el primero.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {/* Resumen */}
          <div className="flex items-center justify-between px-1 mb-3">
            <p className="text-sm text-muted-foreground">
              {docs.length} documento(s) en {Object.keys(byCategory).length} carpeta(s)
            </p>
            {isContador && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-lg">
                <Eye className="w-3.5 h-3.5" />
                <span>Usa el ojo para controlar qué ve el cliente</span>
              </div>
            )}
          </div>

          {Object.entries(byCategory).map(([cat, catDocs]) => {
            const catInfo = CATEGORIAS[cat] ?? CATEGORIAS.otro
            const isOpen = openFolders[cat] ?? true
            const visibleCount = catDocs.filter((d) => d.visible_to_client).length

            return (
              <div key={cat} className="bg-card border border-border rounded-xl overflow-hidden">
                {/* Cabecera de carpeta */}
                <button
                  onClick={() => toggleFolder(cat)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
                >
                  {isOpen ? (
                    <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  )}
                  <span className="text-base">{catInfo.icon}</span>
                  {isOpen ? (
                    <FolderOpen className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  ) : (
                    <Folder className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  )}
                  <span className="font-medium text-foreground text-sm flex-1 text-left">
                    {catInfo.label}
                  </span>
                  <div className="flex items-center gap-2">
                    {isContador && visibleCount > 0 && (
                      <span className="text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                        {visibleCount} visible{visibleCount !== 1 ? 's' : ''} al cliente
                      </span>
                    )}
                    <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', catInfo.color)}>
                      {catDocs.length}
                    </span>
                  </div>
                </button>

                {/* Documentos en la carpeta */}
                {isOpen && (
                  <div className="border-t border-border divide-y divide-border">
                    {catDocs.map((doc) => (
                      <div
                        key={doc.id}
                        className={cn(
                          'flex items-start gap-3 px-5 py-3.5 hover:bg-muted/20 transition-colors',
                          !doc.visible_to_client && isContador && 'opacity-70'
                        )}
                      >
                        <div className="flex-shrink-0 mt-0.5">
                          <FileTypeIcon type={doc.file_type} />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-foreground text-sm">{doc.nombre}</p>
                            {doc.periodo && (
                              <span className="px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground">
                                {doc.periodo}
                              </span>
                            )}
                            {isContador && (
                              <span className={cn(
                                'px-2 py-0.5 rounded-full text-xs font-medium',
                                doc.visible_to_client
                                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                                  : 'bg-muted text-muted-foreground'
                              )}>
                                {doc.visible_to_client ? 'Visible al cliente' : 'Privado'}
                              </span>
                            )}
                          </div>
                          {doc.descripcion && (
                            <p className="text-xs text-muted-foreground mt-0.5">{doc.descripcion}</p>
                          )}
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            <span className="truncate max-w-[200px]">{doc.file_name}</span>
                            {doc.file_size && <span>{formatFileSize(doc.file_size)}</span>}
                            <span>
                              {new Date(doc.created_at).toLocaleDateString('es-CO', {
                                day: '2-digit', month: 'short', year: 'numeric',
                              })}
                            </span>
                            {doc.uploaded_by && (
                              <span>por {doc.uploaded_by.nombre} {doc.uploaded_by.apellido}</span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 flex-shrink-0">
                          {/* Toggle visibilidad (solo contador/admin) */}
                          {isContador && (
                            <button
                              onClick={() => handleToggleVisibility(doc)}
                              disabled={togglingId === doc.id}
                              title={doc.visible_to_client ? 'Ocultar al cliente' : 'Dar acceso al cliente'}
                              className={cn(
                                'p-2 rounded-lg transition-colors',
                                doc.visible_to_client
                                  ? 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10'
                                  : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                                'disabled:opacity-50'
                              )}
                            >
                              {togglingId === doc.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : doc.visible_to_client ? (
                                <Eye className="w-4 h-4" />
                              ) : (
                                <EyeOff className="w-4 h-4" />
                              )}
                            </button>
                          )}

                          {/* Descargar */}
                          <a
                            href={doc.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                            title="Ver / Descargar"
                          >
                            <Download className="w-4 h-4" />
                          </a>

                          {/* Eliminar (solo contador/admin) */}
                          {canUpload && (
                            <button
                              onClick={() => handleDelete(doc)}
                              disabled={deletingId === doc.id}
                              className="p-2 rounded-lg text-muted-foreground hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-50"
                              title="Eliminar documento"
                            >
                              {deletingId === doc.id
                                ? <Loader2 className="w-4 h-4 animate-spin" />
                                : <Trash2 className="w-4 h-4" />}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
