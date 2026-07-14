'use client'

// Página: Gestión de FAQs del Chatbot
import { useState, useEffect } from 'react'
import { MessageSquarePlus, Plus, Edit2, Trash2, Save, X, Loader2, Search, Tag } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface Faq {
  id: string
  pregunta: string
  respuesta: string
  categoria: string
  activo: boolean
  orden: number
  tags?: string[]
}

const CATEGORIAS_SUGERIDAS = [
  'IVA', 'Renta', 'ICA', 'Retención en la Fuente', 'DIAN', 'NIIF',
  'Nómina', 'Seguridad Social', 'Libros Contables', 'General'
]

function FaqForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Faq | null
  onSave: (faq: Faq) => void
  onCancel: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    pregunta: initial?.pregunta ?? '',
    respuesta: initial?.respuesta ?? '',
    categoria: initial?.categoria ?? '',
    activo: initial?.activo ?? true,
    orden: initial?.orden ?? 0,
    tags: initial?.tags?.join(', ') ?? '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = {
        ...form,
        tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      }

      const url = initial ? `/api/admin/faqs/${initial.id}` : '/api/admin/faqs'
      const method = initial ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error al guardar')

      toast.success(initial ? 'FAQ actualizada' : 'FAQ creada exitosamente')
      onSave(json.data)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">
          Pregunta <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={form.pregunta}
          onChange={(e) => setForm(p => ({ ...p, pregunta: e.target.value }))}
          required
          minLength={10}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="¿Cuándo se debe presentar la declaración de IVA?"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1">
          Respuesta <span className="text-red-500">*</span>
        </label>
        <textarea
          value={form.respuesta}
          onChange={(e) => setForm(p => ({ ...p, respuesta: e.target.value }))}
          required
          minLength={10}
          rows={5}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          placeholder="La declaración de IVA se debe presentar..."
        />
        <p className="text-xs text-muted-foreground mt-1">{form.respuesta.length} caracteres</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Categoría</label>
          <input
            type="text"
            value={form.categoria}
            onChange={(e) => setForm(p => ({ ...p, categoria: e.target.value }))}
            list="categorias-list"
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="IVA, Renta, General..."
          />
          <datalist id="categorias-list">
            {CATEGORIAS_SUGERIDAS.map(c => <option key={c} value={c} />)}
          </datalist>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Orden (número)</label>
          <input
            type="number"
            value={form.orden}
            onChange={(e) => setForm(p => ({ ...p, orden: parseInt(e.target.value) || 0 }))}
            min={0}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1">
          Etiquetas (separadas por comas)
        </label>
        <input
          type="text"
          value={form.tags}
          onChange={(e) => setForm(p => ({ ...p, tags: e.target.value }))}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="declaración, formulario, plazo..."
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="faq_activo"
          checked={form.activo}
          onChange={(e) => setForm(p => ({ ...p, activo: e.target.checked }))}
          className="rounded border-border"
        />
        <label htmlFor="faq_activo" className="text-sm text-foreground cursor-pointer">
          FAQ activa (visible para el chatbot)
        </label>
      </div>

      <div className="flex justify-end gap-3 pt-2 border-t border-border">
        <button type="button" onClick={onCancel}
          className="px-4 py-2 text-sm rounded-xl border border-border text-foreground hover:bg-muted transition-colors"
        >
          Cancelar
        </button>
        <button type="submit" disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-xl bg-primary text-primary-foreground hover:bg-primary-light transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {initial ? 'Guardar cambios' : 'Crear FAQ'}
        </button>
      </div>
    </form>
  )
}

export default function FaqsPage() {
  const [faqs, setFaqs] = useState<Faq[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editFaq, setEditFaq] = useState<Faq | null>(null)
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState('all')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  useEffect(() => {
    fetchFaqs()
  }, [])

  const fetchFaqs = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/faqs')
      const json = await res.json()
      if (res.ok) setFaqs(json.data ?? [])
    } catch {
      toast.error('Error al cargar FAQs')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = (faq: Faq) => {
    if (editFaq) {
      setFaqs(prev => prev.map(f => f.id === faq.id ? faq : f))
    } else {
      setFaqs(prev => [...prev, faq])
    }
    setShowForm(false)
    setEditFaq(null)
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/faqs/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setFaqs(prev => prev.filter(f => f.id !== id))
      toast.success('FAQ eliminada')
    } catch {
      toast.error('Error al eliminar')
    } finally {
      setConfirmDelete(null)
    }
  }

  // Categorías únicas
  const categorias = Array.from(new Set(faqs.map(f => f.categoria).filter(Boolean)))

  const filtered = faqs.filter(f => {
    const matchSearch = !search ||
      f.pregunta.toLowerCase().includes(search.toLowerCase()) ||
      f.respuesta.toLowerCase().includes(search.toLowerCase())
    const matchCat = filterCat === 'all' || f.categoria === filterCat
    return matchSearch && matchCat
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
            <MessageSquarePlus className="w-6 h-6 text-primary" />
            Base de Conocimiento del Chatbot
          </h1>
          <p className="text-muted-foreground mt-1">
            Gestiona las preguntas frecuentes que usa el AsistenteConta para responder
          </p>
        </div>
        <button
          onClick={() => { setShowForm(true); setEditFaq(null) }}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium text-sm hover:bg-primary-light transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nueva FAQ
        </button>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total FAQs', value: faqs.length, color: 'text-foreground' },
          { label: 'Activas', value: faqs.filter(f => f.activo).length, color: 'text-success' },
          { label: 'Categorías', value: categorias.length, color: 'text-primary' },
        ].map(s => (
          <div key={s.label} className="kpi-card text-center">
            <p className={cn('text-2xl font-mono font-bold', s.color)}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Formulario */}
      {(showForm || editFaq) && (
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-foreground">
              {editFaq ? 'Editar FAQ' : 'Nueva FAQ'}
            </h2>
            <button
              onClick={() => { setShowForm(false); setEditFaq(null) }}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <FaqForm
            initial={editFaq}
            onSave={handleSave}
            onCancel={() => { setShowForm(false); setEditFaq(null) }}
          />
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="search"
            placeholder="Buscar en preguntas y respuestas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <select
          value={filterCat}
          onChange={(e) => setFilterCat(e.target.value)}
          className="rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="all">Todas las categorías</option>
          {categorias.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Lista de FAQs */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <MessageSquarePlus className="w-12 h-12 text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground">
            {search || filterCat !== 'all' ? 'No hay FAQs con estos filtros' : 'No hay FAQs registradas'}
          </p>
          {!search && (
            <button onClick={() => setShowForm(true)}
              className="mt-3 inline-flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <Plus className="w-4 h-4" />Crear primera FAQ
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(faq => (
            <div key={faq.id}
              className={cn(
                'bg-card border border-border rounded-xl p-4 transition-all hover:shadow-sm',
                !faq.activo && 'opacity-60'
              )}
            >
              {/* Confirm delete */}
              {confirmDelete === faq.id ? (
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm text-foreground">¿Eliminar esta FAQ?</p>
                  <div className="flex gap-2">
                    <button onClick={() => setConfirmDelete(null)}
                      className="px-3 py-1.5 text-xs rounded-lg border border-border text-foreground hover:bg-muted"
                    >
                      Cancelar
                    </button>
                    <button onClick={() => handleDelete(faq.id)}
                      className="px-3 py-1.5 text-xs rounded-lg bg-red-500 text-white hover:bg-red-600"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {faq.categoria && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
                            <Tag className="w-2.5 h-2.5" />
                            {faq.categoria}
                          </span>
                        )}
                        {!faq.activo && (
                          <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-xs">
                            Inactiva
                          </span>
                        )}
                      </div>
                      <p className="font-medium text-sm text-foreground">{faq.pregunta}</p>
                      <p className="text-sm text-muted-foreground mt-1.5 line-clamp-3">{faq.respuesta}</p>
                      {faq.tags && faq.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {faq.tags.map(tag => (
                            <span key={tag} className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-xs">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => { setEditFaq(faq); setShowForm(false) }}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        title="Editar"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => setConfirmDelete(faq.id)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
