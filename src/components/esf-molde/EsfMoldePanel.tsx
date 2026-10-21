'use client'
// src/components/esf-molde/EsfMoldePanel.tsx
// ════════════════════════════════════════════════════════════════════════
// Panel "ESF por molde".
//   Pantalla 1: lista de empresas con molde + botón "Nueva empresa".
//   Nueva empresa: sube ESF histórico + balance del mismo mes → APRENDER
//                  → muestra el reporte de cruce (qué se aprendió, qué es manual).
//   Empresa existente: versiones (descargar/borrar) + "Agregar mes": sube el
//                  balance nuevo → EXTENDER → reporte de revisión + descarga.
// ════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef } from 'react'
import {
  FileSpreadsheet, Upload, Download, Trash2, Plus, ArrowLeft, Loader2,
  Building2, CheckCircle2, AlertTriangle, Info, ChevronRight, Layers, Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

// ── Tipos ────────────────────────────────────────────────────────────────
interface Empresa {
  id: string; nit: string; nombre_empresa: string | null
  anio: number; mes: number; label: string; origen: string; creado_en: string
}
interface Version extends Empresa {}

interface ReporteAprender {
  resumen: Record<string, any>
  hojas: Record<string, Record<string, number>>
  hojas_omitidas: Record<string, string>
  manual: { hoja: string; fila: number; etiqueta: string; valor: any; motivo: string }[]
  constante: { hoja: string; fila: number; etiqueta: string; valor: any }[]
  dudosos?: { hoja: string; fila: number; etiqueta: string; valor: any; motivo: string }[]
  sin_ubicar: { codigo: string; nombre: string; saldo: number }[]
  advertencias?: string[]
}
interface ReporteExtender {
  resumen: Record<string, any>
  periodo_nuevo: { anio: number; mes: number }
  revisar: { hoja: string; celda: string; etiqueta: string; tipo: string; detalle: string }[]
  terceros_nuevos: { hoja: string; celda: string; nit: string; nombre: string; valor: number; cuenta: string }[]
  sin_ubicar: { codigo: string; nombre: string; saldo: number }[]
  advertencias: string[]
}

const MESES = ['', 'ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC']
const fmt = (n: any) => (typeof n === 'number' ? n.toLocaleString('es-CO', { maximumFractionDigits: 2 }) : String(n ?? ''))

// ── Zona de archivo (simple, sin dependencias) ───────────────────────────
function FileDrop({ label, hint, file, onFile }: { label: string; hint: string; file: File | null; onFile: (f: File | null) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)
  return (
    <div
      onClick={() => ref.current?.click()}
      onDragOver={e => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f) }}
      className={cn(
        'cursor-pointer rounded-2xl border-2 border-dashed p-5 transition-all',
        drag ? 'border-primary bg-primary/5' : file ? 'border-primary/40 bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/40',
      )}
    >
      <input ref={ref} type="file" accept=".xlsx,.xls" className="hidden"
        onChange={e => onFile(e.target.files?.[0] ?? null)} />
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-primary/10"><FileSpreadsheet className="w-5 h-5 text-primary" /></div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{label}</p>
          {file
            ? <p className="text-xs text-primary truncate">{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</p>
            : <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        <Upload className="w-4 h-4 text-muted-foreground" />
      </div>
    </div>
  )
}

// ── Bloques del reporte ──────────────────────────────────────────────────
function Pill({ n, label, tone }: { n: number; label: string; tone: 'ok' | 'warn' | 'info' | 'muted' }) {
  const cls = {
    ok: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
    warn: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
    info: 'bg-primary/10 text-primary border-primary/20',
    muted: 'bg-muted text-muted-foreground border-border',
  }[tone]
  return (
    <div className={cn('rounded-xl border px-3 py-2 text-center', cls)}>
      <p className="text-xl font-bold leading-tight">{n}</p>
      <p className="text-[11px] font-medium uppercase tracking-wide">{label}</p>
    </div>
  )
}

function Seccion({ icon: Icon, titulo, tone, children, vacio }: { icon: any; titulo: string; tone: 'ok' | 'warn' | 'info'; children?: React.ReactNode; vacio?: string }) {
  const color = { ok: 'text-emerald-600', warn: 'text-amber-600', info: 'text-primary' }[tone]
  return (
    <div className="rounded-xl border border-border p-4 space-y-2">
      <div className={cn('flex items-center gap-2 font-semibold text-sm', color)}><Icon className="w-4 h-4" />{titulo}</div>
      {children ?? <p className="text-xs text-muted-foreground">{vacio}</p>}
    </div>
  )
}

function Tabla({ cols, rows }: { cols: string[]; rows: (string | number)[][] }) {
  if (!rows.length) return null
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead><tr className="text-muted-foreground">{cols.map(c => <th key={c} className="text-left font-medium py-1 pr-3">{c}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border/60">
              {r.map((v, j) => <td key={j} className={cn('py-1.5 pr-3 align-top', typeof v === 'number' && 'text-right tabular-nums whitespace-nowrap')}>{typeof v === 'number' ? fmt(v) : v}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ReporteAprendizaje({ r }: { r: ReporteAprender }) {
  const s = r.resumen ?? {}
  const omitidas = Object.entries(r.hojas_omitidas ?? {})
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <Pill n={s.BALANCE ?? 0} label="del balance" tone="ok" />
        <Pill n={(s.FORMULA ?? 0) + (s.CADENA ?? 0)} label="fórmulas" tone="info" />
        <Pill n={s.CONSTANTE ?? 0} label="constantes" tone="muted" />
        <Pill n={s.MANUAL ?? 0} label="manuales" tone="warn" />
        <Pill n={s.hojas_con_meses ?? 0} label={`hojas de ${s.hojas_total ?? '?'}`} tone="muted" />
      </div>
      {(r.advertencias ?? []).map((a, i) => (
        <div key={i} className="flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-800 dark:text-amber-300"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />{a}</div>
      ))}
      <Seccion icon={AlertTriangle} titulo={`Celdas que ella decide a mano (${r.manual.length})`} tone="warn" vacio="Todo cruza con el balance.">
        {r.manual.length > 0 && (
          <>
            <p className="text-xs text-muted-foreground">Cada mes se arrastran del mes anterior y se le marcan para revisar. No se inventan.</p>
            <Tabla cols={['Hoja', 'Fila', 'Renglón', 'Valor', 'Por qué']} rows={r.manual.map(m => [m.hoja, m.fila, m.etiqueta, typeof m.valor === 'number' ? m.valor : String(m.valor), m.motivo])} />
          </>
        )}
      </Seccion>
      {(r.dudosos?.length ?? 0) > 0 && (
        <Seccion icon={Info} titulo={`Cruces dudosos (${r.dudosos!.length})`} tone="info">
          <Tabla cols={['Hoja', 'Fila', 'Renglón', 'Valor', 'Detalle']} rows={r.dudosos!.map(m => [m.hoja, m.fila, m.etiqueta, m.valor, m.motivo])} />
        </Seccion>
      )}
      <Seccion icon={Info} titulo={`Cuentas del balance que no están en el ESF (${r.sin_ubicar.length})`} tone="info" vacio="Todas las subcuentas con saldo tienen renglón.">
        {r.sin_ubicar.length > 0 && (
          <>
            <p className="text-xs text-muted-foreground">Normal en patrimonio (clase 3), que ella maneja con fórmulas. En activo/pasivo conviene revisar.</p>
            <Tabla cols={['Código', 'Cuenta', 'Saldo']} rows={r.sin_ubicar.map(x => [x.codigo, x.nombre, x.saldo])} />
          </>
        )}
      </Seccion>
      <Seccion icon={Layers} titulo="Hojas" tone="info">
        <Tabla cols={['Hoja', 'Balance', 'Fórmulas', 'Const.', 'Manual']}
          rows={Object.entries(r.hojas).map(([h, c]) => [h, c.BALANCE ?? 0, (c.FORMULA ?? 0) + (c.CADENA ?? 0), c.CONSTANTE ?? 0, c.MANUAL ?? 0])} />
        {omitidas.length > 0 && (
          <p className="text-xs text-muted-foreground pt-1">
            No se tocan (van en otro período): {omitidas.map(([h, d]) => `${h} (${d.replace('va en ', '').replace(' (no se actualiza mes a mes)', '')})`).join(' · ')}
          </p>
        )}
      </Seccion>
    </div>
  )
}

function ReporteExtension({ r }: { r: ReporteExtender }) {
  const s = r.resumen ?? {}
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <Pill n={s.celdas_balance ?? 0} label="del balance" tone="ok" />
        <Pill n={s.celdas_formula ?? 0} label="fórmulas" tone="info" />
        <Pill n={s.terceros_nuevos ?? 0} label="terceros nuevos" tone="info" />
        <Pill n={s.revisar ?? 0} label="a revisar" tone="warn" />
        <Pill n={s.sin_ubicar ?? 0} label="sin ubicar" tone={s.sin_ubicar ? 'warn' : 'muted'} />
      </div>
      {(r.advertencias ?? []).map((a, i) => (
        <div key={i} className="flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-800 dark:text-amber-300"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />{a}</div>
      ))}
      <Seccion icon={AlertTriangle} titulo={`Para revisar (${r.revisar.length})`} tone="warn" vacio="Nada que revisar.">
        {r.revisar.length > 0 && <Tabla cols={['Hoja', 'Celda', 'Renglón', 'Qué pasó']} rows={r.revisar.map(x => [x.hoja, x.celda, x.etiqueta, x.detalle])} />}
      </Seccion>
      <Seccion icon={Plus} titulo={`Terceros nuevos con fila propia (${r.terceros_nuevos.length})`} tone="info" vacio="No apareció ningún tercero nuevo.">
        {r.terceros_nuevos.length > 0 && <Tabla cols={['Hoja', 'Celda', 'Tercero', 'NIT', 'Cuenta', 'Valor']} rows={r.terceros_nuevos.map(x => [x.hoja, x.celda, x.nombre, x.nit, x.cuenta, x.valor])} />}
      </Seccion>
      <Seccion icon={Info} titulo={`Cuentas del balance sin renglón (${r.sin_ubicar.length})`} tone="info" vacio="Todas las subcuentas con saldo tienen renglón.">
        {r.sin_ubicar.length > 0 && <Tabla cols={['Código', 'Cuenta', 'Saldo']} rows={r.sin_ubicar.map(x => [x.codigo, x.nombre, x.saldo])} />}
      </Seccion>
    </div>
  )
}

// ── Panel principal ──────────────────────────────────────────────────────
type Vista = 'lista' | 'nueva' | 'empresa'

export function EsfMoldePanel() {
  const [vista, setVista] = useState<Vista>('lista')
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [cargando, setCargando] = useState(true)
  const [empresa, setEmpresa] = useState<Empresa | null>(null)
  const [versiones, setVersiones] = useState<Version[]>([])

  // nueva empresa
  const [esfFile, setEsfFile] = useState<File | null>(null)
  const [balFile, setBalFile] = useState<File | null>(null)
  const [procesando, setProcesando] = useState(false)
  const [repAprender, setRepAprender] = useState<ReporteAprender | null>(null)
  const [resultadoNueva, setResultadoNueva] = useState<{ id: string; empresa: string; nit: string; anio: number; mes: number } | null>(null)

  // agregar mes
  const [balNuevo, setBalNuevo] = useState<File | null>(null)
  const [repExtender, setRepExtender] = useState<ReporteExtender | null>(null)
  const [idNuevo, setIdNuevo] = useState<string | null>(null)
  const [bajando, setBajando] = useState<string | null>(null)

  const cargarEmpresas = () => {
    setCargando(true)
    fetch('/api/esf-molde?empresas=1').then(r => r.json())
      .then(d => { if (d.ok) setEmpresas(d.empresas ?? []); else toast.error(d.error) })
      .catch(() => toast.error('No se pudo cargar la lista'))
      .finally(() => setCargando(false))
  }
  useEffect(cargarEmpresas, [])

  const abrirEmpresa = async (e: Empresa) => {
    setEmpresa(e); setVista('empresa'); setRepExtender(null); setBalNuevo(null); setIdNuevo(null)
    const d = await (await fetch(`/api/esf-molde?nit=${encodeURIComponent(e.nit)}`)).json()
    if (d.ok) setVersiones(d.versiones ?? [])
  }

  const descargar = async (id: string) => {
    setBajando(id)
    try {
      const res = await fetch(`/api/esf-molde?id=${id}&descargar=1`)
      if (!res.ok) { toast.error('No se pudo descargar'); return }
      const blob = await res.blob()
      const cd = res.headers.get('Content-Disposition') ?? ''
      const m = cd.match(/filename="([^"]+)"/)
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob); a.download = m?.[1] ?? 'ESF.xlsx'; a.click(); URL.revokeObjectURL(a.href)
    } finally { setBajando(null) }
  }

  const borrar = async (v: Version) => {
    if (!confirm(`¿Borrar la versión ${v.label}? No se puede deshacer.`)) return
    const d = await (await fetch(`/api/esf-molde?id=${v.id}`, { method: 'DELETE' })).json()
    if (!d.ok) { toast.error(d.error ?? 'No se pudo borrar'); return }
    toast.success('Versión borrada')
    if (empresa) abrirEmpresa(empresa)
    cargarEmpresas()
  }

  const aprender = async () => {
    if (!esfFile || !balFile) { toast.error('Sube el ESF histórico y el balance del mismo mes.'); return }
    setProcesando(true); setRepAprender(null)
    try {
      const fd = new FormData()
      fd.append('action', 'aprender'); fd.append('esf', esfFile); fd.append('balance', balFile)
      const res = await fetch('/api/esf-molde', { method: 'POST', body: fd })
      let d: any = null
      try { d = await res.json() } catch { d = null }
      if (!res.ok || !d?.ok) { toast.error(d?.error ?? `Error ${res.status}`); return }
      setRepAprender(d.reporte); setResultadoNueva({ id: d.id, empresa: d.empresa, nit: d.nit, anio: d.anio, mes: d.mes })
      toast.success(`Molde aprendido: ${d.empresa}`)
      cargarEmpresas()
    } catch (e: any) { toast.error(e?.message ?? 'Error de conexión') } finally { setProcesando(false) }
  }

  const extender = async () => {
    if (!empresa || !balNuevo) { toast.error('Sube el balance del mes nuevo.'); return }
    setProcesando(true); setRepExtender(null); setIdNuevo(null)
    try {
      const fd = new FormData()
      fd.append('action', 'extender'); fd.append('nit', empresa.nit); fd.append('balance', balNuevo)
      const res = await fetch('/api/esf-molde', { method: 'POST', body: fd })
      let d: any = null
      try { d = await res.json() } catch { d = null }
      if (!res.ok || !d?.ok) { toast.error(d?.error ?? `Error ${res.status}`); return }
      setRepExtender(d.reporte); setIdNuevo(d.id)
      toast.success(`Mes agregado: ${MESES[d.mes]} ${d.anio}`)
      cargarEmpresas()
      const v = await (await fetch(`/api/esf-molde?nit=${encodeURIComponent(empresa.nit)}`)).json()
      if (v.ok) setVersiones(v.versiones ?? [])
    } catch (e: any) { toast.error(e?.message ?? 'Error de conexión') } finally { setProcesando(false) }
  }

  const volver = () => { setVista('lista'); setEmpresa(null); setEsfFile(null); setBalFile(null); setRepAprender(null); setResultadoNueva(null); setRepExtender(null); setBalNuevo(null) }

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-primary/10 rounded-2xl"><FileSpreadsheet className="w-6 h-6 text-primary" /></div>
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">ESF por molde</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Tu ESF histórico es la plantilla. Cada mes solo subes el balance y se agrega la columna.</p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-primary/5 border border-primary/20 rounded-full">
          <Sparkles className="w-3.5 h-3.5 text-primary" /><span className="text-xs font-medium text-primary">Copia tu estructura · no inventa</span>
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl p-6">

        {/* ── LISTA ── */}
        {vista === 'lista' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-foreground">Empresas con molde</h2>
                <p className="text-sm text-muted-foreground">Elige una para agregarle un mes, o registra una nueva.</p>
              </div>
              <button onClick={() => setVista('nueva')} className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary-light transition-colors">
                <Plus className="w-4 h-4" /> Nueva empresa
              </button>
            </div>
            {cargando ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Cargando...</div>
            ) : empresas.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-border p-8 text-center">
                <Building2 className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm font-medium text-foreground">Todavía no hay empresas</p>
                <p className="text-xs text-muted-foreground mt-1">Sube el ESF histórico de una empresa junto con el balance de su último mes.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {empresas.map(e => (
                  <button key={e.nit} onClick={() => abrirEmpresa(e)} className="group flex items-center gap-3 p-4 rounded-xl border border-border hover:border-primary hover:bg-primary/5 transition-all text-left">
                    <div className="p-2.5 rounded-xl bg-muted group-hover:bg-primary/10"><Building2 className="w-5 h-5 text-muted-foreground group-hover:text-primary" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm text-foreground truncate">{e.nombre_empresa ?? e.nit}</p>
                      <p className="text-xs text-muted-foreground">NIT {e.nit} · va en <span className="font-medium text-foreground">{e.label}</span></p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── NUEVA EMPRESA ── */}
        {vista === 'nueva' && (
          <div className="space-y-5">
            <button onClick={volver} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> Volver</button>
            {!repAprender ? (
              <>
                <div>
                  <h2 className="font-semibold text-foreground">Registrar una empresa</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Sube el <b>ESF histórico</b> (el Excel que ya usas, con todas sus hojas y fórmulas) y el <b>balance de prueba del mismo mes</b> en que va ese ESF.
                    El sistema cruza los dos y aprende de dónde sale cada número. No modifica tu archivo.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <FileDrop label="ESF histórico (.xlsx)" hint="El estado financiero completo, ya formulado" file={esfFile} onFile={setEsfFile} />
                  <FileDrop label="Balance de prueba del mismo mes" hint="Siigo, World Office, SIESA o SYD" file={balFile} onFile={setBalFile} />
                </div>
                <button onClick={aprender} disabled={procesando || !esfFile || !balFile}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary-light transition-colors disabled:opacity-50">
                  {procesando ? <><Loader2 className="w-4 h-4 animate-spin" /> Analizando el ESF (puede tardar ~1 min)...</> : <><Sparkles className="w-4 h-4" /> Aprender el molde</>}
                </button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-800 dark:text-emerald-300">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  Molde aprendido para <b className="mx-1">{resultadoNueva?.empresa}</b> (NIT {resultadoNueva?.nit}) · va en {MESES[resultadoNueva?.mes ?? 0]} {resultadoNueva?.anio}
                </div>
                <ReporteAprendizaje r={repAprender} />
                <div className="flex gap-2">
                  <button onClick={volver} className="px-4 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted">Ir a la lista</button>
                  <button onClick={() => { const e = empresas.find(x => x.nit === resultadoNueva?.nit); if (e) abrirEmpresa(e); else volver() }}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary-light">
                    Agregar el mes siguiente <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── EMPRESA ── */}
        {vista === 'empresa' && empresa && (
          <div className="space-y-5">
            <button onClick={volver} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> Volver</button>
            <div>
              <h2 className="font-semibold text-foreground">{empresa.nombre_empresa ?? empresa.nit}</h2>
              <p className="text-sm text-muted-foreground">NIT {empresa.nit} · el ESF va en <b>{versiones[0]?.label ?? empresa.label}</b></p>
            </div>

            {/* Agregar mes */}
            <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 space-y-3">
              <div className="flex items-center gap-2 font-semibold text-sm text-foreground"><Plus className="w-4 h-4 text-primary" /> Agregar un mes</div>
              <p className="text-xs text-muted-foreground">Sube el balance del mes siguiente. Se inserta la columna en todas las hojas, se clonan las fórmulas y se escriben los valores del balance. Lo que es criterio tuyo queda marcado para revisar.</p>
              <FileDrop label="Balance de prueba del mes nuevo" hint="Siigo, World Office, SIESA o SYD" file={balNuevo} onFile={setBalNuevo} />
              <button onClick={extender} disabled={procesando || !balNuevo}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary-light transition-colors disabled:opacity-50">
                {procesando ? <><Loader2 className="w-4 h-4 animate-spin" /> Agregando el mes (puede tardar ~1 min)...</> : <><Layers className="w-4 h-4" /> Agregar mes al ESF</>}
              </button>
              {repExtender && idNuevo && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-800 dark:text-emerald-300">
                    <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Listo: {MESES[repExtender.periodo_nuevo.mes]} {repExtender.periodo_nuevo.anio} agregado y guardado.</span>
                    <button onClick={() => descargar(idNuevo)} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700">
                      {bajando === idNuevo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Descargar
                    </button>
                  </div>
                  <ReporteExtension r={repExtender} />
                </div>
              )}
            </div>

            {/* Versiones */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Versiones guardadas</p>
              {versiones.map(v => (
                <div key={v.id} className="flex items-center gap-3 p-3 rounded-xl border border-border">
                  <FileSpreadsheet className="w-5 h-5 text-primary shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{v.label} <span className="text-xs font-normal text-muted-foreground">· {v.origen === 'aprendido' ? 'ESF original subido' : 'mes agregado por el sistema'}</span></p>
                    <p className="text-xs text-muted-foreground">{new Date(v.creado_en).toLocaleString('es-CO')}</p>
                  </div>
                  <button onClick={() => descargar(v.id)} title="Descargar" className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground">
                    {bajando === v.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  </button>
                  <button onClick={() => borrar(v)} title="Borrar" className="p-2 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
