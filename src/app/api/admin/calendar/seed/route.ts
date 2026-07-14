// API Route: Importar calendario tributario 2026 desde Boletín CALA ASOCIADOS
// Solo accesible por administradores
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type CalendarRow = {
  tipo_impuesto: string
  año: number
  mes: number
  dia_vencimiento: number
  fecha_vencimiento: string
  digitos_nit?: string | null
  descripcion?: string | null
}

// Datos del Boletín Tributario CALA ASOCIADOS 2026
// Fuente: NIT 800.089.091-5 | jimmy@calaasociados.com
const CALENDARIO_2026: CalendarRow[] = [
  // ── RETENCIÓN EN LA FUENTE MENSUAL (por último dígito NIT) ──────────────
  // Período Enero → vence Febrero
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:2, dia_vencimiento:10, fecha_vencimiento:'2026-02-10', digitos_nit:'1', descripcion:'Retención Fuente Ene 2026 — NIT termina en 1' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:2, dia_vencimiento:11, fecha_vencimiento:'2026-02-11', digitos_nit:'2', descripcion:'Retención Fuente Ene 2026 — NIT termina en 2' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:2, dia_vencimiento:12, fecha_vencimiento:'2026-02-12', digitos_nit:'3', descripcion:'Retención Fuente Ene 2026 — NIT termina en 3' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:2, dia_vencimiento:13, fecha_vencimiento:'2026-02-13', digitos_nit:'4', descripcion:'Retención Fuente Ene 2026 — NIT termina en 4' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:2, dia_vencimiento:16, fecha_vencimiento:'2026-02-16', digitos_nit:'5', descripcion:'Retención Fuente Ene 2026 — NIT termina en 5' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:2, dia_vencimiento:17, fecha_vencimiento:'2026-02-17', digitos_nit:'6', descripcion:'Retención Fuente Ene 2026 — NIT termina en 6' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:2, dia_vencimiento:18, fecha_vencimiento:'2026-02-18', digitos_nit:'7', descripcion:'Retención Fuente Ene 2026 — NIT termina en 7' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:2, dia_vencimiento:19, fecha_vencimiento:'2026-02-19', digitos_nit:'8', descripcion:'Retención Fuente Ene 2026 — NIT termina en 8' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:2, dia_vencimiento:20, fecha_vencimiento:'2026-02-20', digitos_nit:'9', descripcion:'Retención Fuente Ene 2026 — NIT termina en 9' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:2, dia_vencimiento:23, fecha_vencimiento:'2026-02-23', digitos_nit:'0', descripcion:'Retención Fuente Ene 2026 — NIT termina en 0' },
  // Período Febrero → vence Marzo
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:3, dia_vencimiento:10, fecha_vencimiento:'2026-03-10', digitos_nit:'1', descripcion:'Retención Fuente Feb 2026 — NIT termina en 1' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:3, dia_vencimiento:11, fecha_vencimiento:'2026-03-11', digitos_nit:'2', descripcion:'Retención Fuente Feb 2026 — NIT termina en 2' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:3, dia_vencimiento:12, fecha_vencimiento:'2026-03-12', digitos_nit:'3', descripcion:'Retención Fuente Feb 2026 — NIT termina en 3' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:3, dia_vencimiento:13, fecha_vencimiento:'2026-03-13', digitos_nit:'4', descripcion:'Retención Fuente Feb 2026 — NIT termina en 4' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:3, dia_vencimiento:16, fecha_vencimiento:'2026-03-16', digitos_nit:'5', descripcion:'Retención Fuente Feb 2026 — NIT termina en 5' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:3, dia_vencimiento:17, fecha_vencimiento:'2026-03-17', digitos_nit:'6', descripcion:'Retención Fuente Feb 2026 — NIT termina en 6' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:3, dia_vencimiento:18, fecha_vencimiento:'2026-03-18', digitos_nit:'7', descripcion:'Retención Fuente Feb 2026 — NIT termina en 7' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:3, dia_vencimiento:19, fecha_vencimiento:'2026-03-19', digitos_nit:'8', descripcion:'Retención Fuente Feb 2026 — NIT termina en 8' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:3, dia_vencimiento:20, fecha_vencimiento:'2026-03-20', digitos_nit:'9', descripcion:'Retención Fuente Feb 2026 — NIT termina en 9' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:3, dia_vencimiento:24, fecha_vencimiento:'2026-03-24', digitos_nit:'0', descripcion:'Retención Fuente Feb 2026 — NIT termina en 0' },
  // Período Marzo → vence Abril
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:4, dia_vencimiento:13, fecha_vencimiento:'2026-04-13', digitos_nit:'1', descripcion:'Retención Fuente Mar 2026 — NIT termina en 1' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:4, dia_vencimiento:14, fecha_vencimiento:'2026-04-14', digitos_nit:'2', descripcion:'Retención Fuente Mar 2026 — NIT termina en 2' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:4, dia_vencimiento:15, fecha_vencimiento:'2026-04-15', digitos_nit:'3', descripcion:'Retención Fuente Mar 2026 — NIT termina en 3' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:4, dia_vencimiento:16, fecha_vencimiento:'2026-04-16', digitos_nit:'4', descripcion:'Retención Fuente Mar 2026 — NIT termina en 4' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:4, dia_vencimiento:17, fecha_vencimiento:'2026-04-17', digitos_nit:'5', descripcion:'Retención Fuente Mar 2026 — NIT termina en 5' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:4, dia_vencimiento:20, fecha_vencimiento:'2026-04-20', digitos_nit:'6', descripcion:'Retención Fuente Mar 2026 — NIT termina en 6' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:4, dia_vencimiento:21, fecha_vencimiento:'2026-04-21', digitos_nit:'7', descripcion:'Retención Fuente Mar 2026 — NIT termina en 7' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:4, dia_vencimiento:22, fecha_vencimiento:'2026-04-22', digitos_nit:'8', descripcion:'Retención Fuente Mar 2026 — NIT termina en 8' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:4, dia_vencimiento:23, fecha_vencimiento:'2026-04-23', digitos_nit:'9', descripcion:'Retención Fuente Mar 2026 — NIT termina en 9' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:4, dia_vencimiento:24, fecha_vencimiento:'2026-04-24', digitos_nit:'0', descripcion:'Retención Fuente Mar 2026 — NIT termina en 0' },
  // Período Abril → vence Mayo
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:5, dia_vencimiento:12, fecha_vencimiento:'2026-05-12', digitos_nit:'1', descripcion:'Retención Fuente Abr 2026 — NIT termina en 1' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:5, dia_vencimiento:13, fecha_vencimiento:'2026-05-13', digitos_nit:'2', descripcion:'Retención Fuente Abr 2026 — NIT termina en 2' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:5, dia_vencimiento:14, fecha_vencimiento:'2026-05-14', digitos_nit:'3', descripcion:'Retención Fuente Abr 2026 — NIT termina en 3' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:5, dia_vencimiento:15, fecha_vencimiento:'2026-05-15', digitos_nit:'4', descripcion:'Retención Fuente Abr 2026 — NIT termina en 4' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:5, dia_vencimiento:19, fecha_vencimiento:'2026-05-19', digitos_nit:'5', descripcion:'Retención Fuente Abr 2026 — NIT termina en 5' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:5, dia_vencimiento:20, fecha_vencimiento:'2026-05-20', digitos_nit:'6', descripcion:'Retención Fuente Abr 2026 — NIT termina en 6' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:5, dia_vencimiento:21, fecha_vencimiento:'2026-05-21', digitos_nit:'7', descripcion:'Retención Fuente Abr 2026 — NIT termina en 7' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:5, dia_vencimiento:22, fecha_vencimiento:'2026-05-22', digitos_nit:'8', descripcion:'Retención Fuente Abr 2026 — NIT termina en 8' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:5, dia_vencimiento:25, fecha_vencimiento:'2026-05-25', digitos_nit:'9', descripcion:'Retención Fuente Abr 2026 — NIT termina en 9' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:5, dia_vencimiento:26, fecha_vencimiento:'2026-05-26', digitos_nit:'0', descripcion:'Retención Fuente Abr 2026 — NIT termina en 0' },
  // Período Mayo → vence Junio
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:6, dia_vencimiento:10, fecha_vencimiento:'2026-06-10', digitos_nit:'1', descripcion:'Retención Fuente May 2026 — NIT termina en 1' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:6, dia_vencimiento:11, fecha_vencimiento:'2026-06-11', digitos_nit:'2', descripcion:'Retención Fuente May 2026 — NIT termina en 2' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:6, dia_vencimiento:12, fecha_vencimiento:'2026-06-12', digitos_nit:'3', descripcion:'Retención Fuente May 2026 — NIT termina en 3' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:6, dia_vencimiento:16, fecha_vencimiento:'2026-06-16', digitos_nit:'4', descripcion:'Retención Fuente May 2026 — NIT termina en 4' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:6, dia_vencimiento:17, fecha_vencimiento:'2026-06-17', digitos_nit:'5', descripcion:'Retención Fuente May 2026 — NIT termina en 5' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:6, dia_vencimiento:18, fecha_vencimiento:'2026-06-18', digitos_nit:'6', descripcion:'Retención Fuente May 2026 — NIT termina en 6' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:6, dia_vencimiento:19, fecha_vencimiento:'2026-06-19', digitos_nit:'7', descripcion:'Retención Fuente May 2026 — NIT termina en 7' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:6, dia_vencimiento:22, fecha_vencimiento:'2026-06-22', digitos_nit:'8', descripcion:'Retención Fuente May 2026 — NIT termina en 8' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:6, dia_vencimiento:23, fecha_vencimiento:'2026-06-23', digitos_nit:'9', descripcion:'Retención Fuente May 2026 — NIT termina en 9' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:6, dia_vencimiento:24, fecha_vencimiento:'2026-06-24', digitos_nit:'0', descripcion:'Retención Fuente May 2026 — NIT termina en 0' },
  // Período Junio → vence Julio
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:7, dia_vencimiento:9,  fecha_vencimiento:'2026-07-09', digitos_nit:'1', descripcion:'Retención Fuente Jun 2026 — NIT termina en 1' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:7, dia_vencimiento:10, fecha_vencimiento:'2026-07-10', digitos_nit:'2', descripcion:'Retención Fuente Jun 2026 — NIT termina en 2' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:7, dia_vencimiento:13, fecha_vencimiento:'2026-07-13', digitos_nit:'3', descripcion:'Retención Fuente Jun 2026 — NIT termina en 3' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:7, dia_vencimiento:14, fecha_vencimiento:'2026-07-14', digitos_nit:'4', descripcion:'Retención Fuente Jun 2026 — NIT termina en 4' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:7, dia_vencimiento:15, fecha_vencimiento:'2026-07-15', digitos_nit:'5', descripcion:'Retención Fuente Jun 2026 — NIT termina en 5' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:7, dia_vencimiento:16, fecha_vencimiento:'2026-07-16', digitos_nit:'6', descripcion:'Retención Fuente Jun 2026 — NIT termina en 6' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:7, dia_vencimiento:17, fecha_vencimiento:'2026-07-17', digitos_nit:'7', descripcion:'Retención Fuente Jun 2026 — NIT termina en 7' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:7, dia_vencimiento:21, fecha_vencimiento:'2026-07-21', digitos_nit:'8', descripcion:'Retención Fuente Jun 2026 — NIT termina en 8' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:7, dia_vencimiento:22, fecha_vencimiento:'2026-07-22', digitos_nit:'9', descripcion:'Retención Fuente Jun 2026 — NIT termina en 9' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:7, dia_vencimiento:23, fecha_vencimiento:'2026-07-23', digitos_nit:'0', descripcion:'Retención Fuente Jun 2026 — NIT termina en 0' },
  // Período Julio → vence Agosto
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:8, dia_vencimiento:12, fecha_vencimiento:'2026-08-12', digitos_nit:'1', descripcion:'Retención Fuente Jul 2026 — NIT termina en 1' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:8, dia_vencimiento:13, fecha_vencimiento:'2026-08-13', digitos_nit:'2', descripcion:'Retención Fuente Jul 2026 — NIT termina en 2' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:8, dia_vencimiento:14, fecha_vencimiento:'2026-08-14', digitos_nit:'3', descripcion:'Retención Fuente Jul 2026 — NIT termina en 3' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:8, dia_vencimiento:18, fecha_vencimiento:'2026-08-18', digitos_nit:'4', descripcion:'Retención Fuente Jul 2026 — NIT termina en 4' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:8, dia_vencimiento:19, fecha_vencimiento:'2026-08-19', digitos_nit:'5', descripcion:'Retención Fuente Jul 2026 — NIT termina en 5' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:8, dia_vencimiento:20, fecha_vencimiento:'2026-08-20', digitos_nit:'6', descripcion:'Retención Fuente Jul 2026 — NIT termina en 6' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:8, dia_vencimiento:21, fecha_vencimiento:'2026-08-21', digitos_nit:'7', descripcion:'Retención Fuente Jul 2026 — NIT termina en 7' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:8, dia_vencimiento:24, fecha_vencimiento:'2026-08-24', digitos_nit:'8', descripcion:'Retención Fuente Jul 2026 — NIT termina en 8' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:8, dia_vencimiento:25, fecha_vencimiento:'2026-08-25', digitos_nit:'9', descripcion:'Retención Fuente Jul 2026 — NIT termina en 9' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:8, dia_vencimiento:26, fecha_vencimiento:'2026-08-26', digitos_nit:'0', descripcion:'Retención Fuente Jul 2026 — NIT termina en 0' },
  // Período Agosto → vence Septiembre
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:9, dia_vencimiento:9,  fecha_vencimiento:'2026-09-09', digitos_nit:'1', descripcion:'Retención Fuente Ago 2026 — NIT termina en 1' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:9, dia_vencimiento:10, fecha_vencimiento:'2026-09-10', digitos_nit:'2', descripcion:'Retención Fuente Ago 2026 — NIT termina en 2' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:9, dia_vencimiento:11, fecha_vencimiento:'2026-09-11', digitos_nit:'3', descripcion:'Retención Fuente Ago 2026 — NIT termina en 3' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:9, dia_vencimiento:14, fecha_vencimiento:'2026-09-14', digitos_nit:'4', descripcion:'Retención Fuente Ago 2026 — NIT termina en 4' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:9, dia_vencimiento:15, fecha_vencimiento:'2026-09-15', digitos_nit:'5', descripcion:'Retención Fuente Ago 2026 — NIT termina en 5' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:9, dia_vencimiento:16, fecha_vencimiento:'2026-09-16', digitos_nit:'6', descripcion:'Retención Fuente Ago 2026 — NIT termina en 6' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:9, dia_vencimiento:17, fecha_vencimiento:'2026-09-17', digitos_nit:'7', descripcion:'Retención Fuente Ago 2026 — NIT termina en 7' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:9, dia_vencimiento:18, fecha_vencimiento:'2026-09-18', digitos_nit:'8', descripcion:'Retención Fuente Ago 2026 — NIT termina en 8' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:9, dia_vencimiento:21, fecha_vencimiento:'2026-09-21', digitos_nit:'9', descripcion:'Retención Fuente Ago 2026 — NIT termina en 9' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:9, dia_vencimiento:22, fecha_vencimiento:'2026-09-22', digitos_nit:'0', descripcion:'Retención Fuente Ago 2026 — NIT termina en 0' },
  // Período Septiembre → vence Octubre
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:10, dia_vencimiento:9,  fecha_vencimiento:'2026-10-09', digitos_nit:'1', descripcion:'Retención Fuente Sep 2026 — NIT termina en 1' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:10, dia_vencimiento:13, fecha_vencimiento:'2026-10-13', digitos_nit:'2', descripcion:'Retención Fuente Sep 2026 — NIT termina en 2' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:10, dia_vencimiento:14, fecha_vencimiento:'2026-10-14', digitos_nit:'3', descripcion:'Retención Fuente Sep 2026 — NIT termina en 3' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:10, dia_vencimiento:15, fecha_vencimiento:'2026-10-15', digitos_nit:'4', descripcion:'Retención Fuente Sep 2026 — NIT termina en 4' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:10, dia_vencimiento:16, fecha_vencimiento:'2026-10-16', digitos_nit:'5', descripcion:'Retención Fuente Sep 2026 — NIT termina en 5' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:10, dia_vencimiento:19, fecha_vencimiento:'2026-10-19', digitos_nit:'6', descripcion:'Retención Fuente Sep 2026 — NIT termina en 6' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:10, dia_vencimiento:20, fecha_vencimiento:'2026-10-20', digitos_nit:'7', descripcion:'Retención Fuente Sep 2026 — NIT termina en 7' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:10, dia_vencimiento:21, fecha_vencimiento:'2026-10-21', digitos_nit:'8', descripcion:'Retención Fuente Sep 2026 — NIT termina en 8' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:10, dia_vencimiento:22, fecha_vencimiento:'2026-10-22', digitos_nit:'9', descripcion:'Retención Fuente Sep 2026 — NIT termina en 9' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:10, dia_vencimiento:23, fecha_vencimiento:'2026-10-23', digitos_nit:'0', descripcion:'Retención Fuente Sep 2026 — NIT termina en 0' },
  // Período Octubre → vence Noviembre
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:11, dia_vencimiento:11, fecha_vencimiento:'2026-11-11', digitos_nit:'1', descripcion:'Retención Fuente Oct 2026 — NIT termina en 1' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:11, dia_vencimiento:12, fecha_vencimiento:'2026-11-12', digitos_nit:'2', descripcion:'Retención Fuente Oct 2026 — NIT termina en 2' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:11, dia_vencimiento:13, fecha_vencimiento:'2026-11-13', digitos_nit:'3', descripcion:'Retención Fuente Oct 2026 — NIT termina en 3' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:11, dia_vencimiento:17, fecha_vencimiento:'2026-11-17', digitos_nit:'4', descripcion:'Retención Fuente Oct 2026 — NIT termina en 4' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:11, dia_vencimiento:18, fecha_vencimiento:'2026-11-18', digitos_nit:'5', descripcion:'Retención Fuente Oct 2026 — NIT termina en 5' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:11, dia_vencimiento:19, fecha_vencimiento:'2026-11-19', digitos_nit:'6', descripcion:'Retención Fuente Oct 2026 — NIT termina en 6' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:11, dia_vencimiento:20, fecha_vencimiento:'2026-11-20', digitos_nit:'7', descripcion:'Retención Fuente Oct 2026 — NIT termina en 7' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:11, dia_vencimiento:23, fecha_vencimiento:'2026-11-23', digitos_nit:'8', descripcion:'Retención Fuente Oct 2026 — NIT termina en 8' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:11, dia_vencimiento:24, fecha_vencimiento:'2026-11-24', digitos_nit:'9', descripcion:'Retención Fuente Oct 2026 — NIT termina en 9' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:11, dia_vencimiento:25, fecha_vencimiento:'2026-11-25', digitos_nit:'0', descripcion:'Retención Fuente Oct 2026 — NIT termina en 0' },
  // Período Noviembre → vence Diciembre
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:12, dia_vencimiento:10, fecha_vencimiento:'2026-12-10', digitos_nit:'1', descripcion:'Retención Fuente Nov 2026 — NIT termina en 1' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:12, dia_vencimiento:11, fecha_vencimiento:'2026-12-11', digitos_nit:'2', descripcion:'Retención Fuente Nov 2026 — NIT termina en 2' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:12, dia_vencimiento:14, fecha_vencimiento:'2026-12-14', digitos_nit:'3', descripcion:'Retención Fuente Nov 2026 — NIT termina en 3' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:12, dia_vencimiento:15, fecha_vencimiento:'2026-12-15', digitos_nit:'4', descripcion:'Retención Fuente Nov 2026 — NIT termina en 4' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:12, dia_vencimiento:16, fecha_vencimiento:'2026-12-16', digitos_nit:'5', descripcion:'Retención Fuente Nov 2026 — NIT termina en 5' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:12, dia_vencimiento:17, fecha_vencimiento:'2026-12-17', digitos_nit:'6', descripcion:'Retención Fuente Nov 2026 — NIT termina en 6' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:12, dia_vencimiento:18, fecha_vencimiento:'2026-12-18', digitos_nit:'7', descripcion:'Retención Fuente Nov 2026 — NIT termina en 7' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:12, dia_vencimiento:21, fecha_vencimiento:'2026-12-21', digitos_nit:'8', descripcion:'Retención Fuente Nov 2026 — NIT termina en 8' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:12, dia_vencimiento:22, fecha_vencimiento:'2026-12-22', digitos_nit:'9', descripcion:'Retención Fuente Nov 2026 — NIT termina en 9' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:12, dia_vencimiento:23, fecha_vencimiento:'2026-12-23', digitos_nit:'0', descripcion:'Retención Fuente Nov 2026 — NIT termina en 0' },
  // Período Diciembre → vence Enero 2027
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:1, dia_vencimiento:13, fecha_vencimiento:'2027-01-13', digitos_nit:'1', descripcion:'Retención Fuente Dic 2026 — NIT termina en 1' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:1, dia_vencimiento:14, fecha_vencimiento:'2027-01-14', digitos_nit:'2', descripcion:'Retención Fuente Dic 2026 — NIT termina en 2' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:1, dia_vencimiento:15, fecha_vencimiento:'2027-01-15', digitos_nit:'3', descripcion:'Retención Fuente Dic 2026 — NIT termina en 3' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:1, dia_vencimiento:18, fecha_vencimiento:'2027-01-18', digitos_nit:'4', descripcion:'Retención Fuente Dic 2026 — NIT termina en 4' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:1, dia_vencimiento:19, fecha_vencimiento:'2027-01-19', digitos_nit:'5', descripcion:'Retención Fuente Dic 2026 — NIT termina en 5' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:1, dia_vencimiento:20, fecha_vencimiento:'2027-01-20', digitos_nit:'6', descripcion:'Retención Fuente Dic 2026 — NIT termina en 6' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:1, dia_vencimiento:21, fecha_vencimiento:'2027-01-21', digitos_nit:'7', descripcion:'Retención Fuente Dic 2026 — NIT termina en 7' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:1, dia_vencimiento:22, fecha_vencimiento:'2027-01-22', digitos_nit:'8', descripcion:'Retención Fuente Dic 2026 — NIT termina en 8' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:1, dia_vencimiento:25, fecha_vencimiento:'2027-01-25', digitos_nit:'9', descripcion:'Retención Fuente Dic 2026 — NIT termina en 9' },
  { tipo_impuesto:'RETENCION_FUENTE_MENSUAL', año:2026, mes:1, dia_vencimiento:26, fecha_vencimiento:'2027-01-26', digitos_nit:'0', descripcion:'Retención Fuente Dic 2026 — NIT termina en 0' },
  // ── IVA BIMESTRAL (por último dígito NIT) ─────────────────────────────────
  // 1er bimestre (Ene-Feb) → vence Marzo (fechas exactas del Boletín CALA 2026)
  { tipo_impuesto:'IVA_BIMESTRAL', año:2026, mes:3, dia_vencimiento:10, fecha_vencimiento:'2026-03-10', digitos_nit:'1', descripcion:'IVA Bimestral Ene-Feb 2026 — NIT 1' },
  { tipo_impuesto:'IVA_BIMESTRAL', año:2026, mes:3, dia_vencimiento:11, fecha_vencimiento:'2026-03-11', digitos_nit:'2', descripcion:'IVA Bimestral Ene-Feb 2026 — NIT 2' },
  { tipo_impuesto:'IVA_BIMESTRAL', año:2026, mes:3, dia_vencimiento:12, fecha_vencimiento:'2026-03-12', digitos_nit:'3', descripcion:'IVA Bimestral Ene-Feb 2026 — NIT 3' },
  { tipo_impuesto:'IVA_BIMESTRAL', año:2026, mes:3, dia_vencimiento:13, fecha_vencimiento:'2026-03-13', digitos_nit:'4', descripcion:'IVA Bimestral Ene-Feb 2026 — NIT 4' },
  { tipo_impuesto:'IVA_BIMESTRAL', año:2026, mes:3, dia_vencimiento:16, fecha_vencimiento:'2026-03-16', digitos_nit:'5', descripcion:'IVA Bimestral Ene-Feb 2026 — NIT 5' },
  { tipo_impuesto:'IVA_BIMESTRAL', año:2026, mes:3, dia_vencimiento:17, fecha_vencimiento:'2026-03-17', digitos_nit:'6', descripcion:'IVA Bimestral Ene-Feb 2026 — NIT 6' },
  { tipo_impuesto:'IVA_BIMESTRAL', año:2026, mes:3, dia_vencimiento:18, fecha_vencimiento:'2026-03-18', digitos_nit:'7', descripcion:'IVA Bimestral Ene-Feb 2026 — NIT 7' },
  { tipo_impuesto:'IVA_BIMESTRAL', año:2026, mes:3, dia_vencimiento:19, fecha_vencimiento:'2026-03-19', digitos_nit:'8', descripcion:'IVA Bimestral Ene-Feb 2026 — NIT 8' },
  { tipo_impuesto:'IVA_BIMESTRAL', año:2026, mes:3, dia_vencimiento:20, fecha_vencimiento:'2026-03-20', digitos_nit:'9', descripcion:'IVA Bimestral Ene-Feb 2026 — NIT 9' },
  { tipo_impuesto:'IVA_BIMESTRAL', año:2026, mes:3, dia_vencimiento:24, fecha_vencimiento:'2026-03-24', digitos_nit:'0', descripcion:'IVA Bimestral Ene-Feb 2026 — NIT 0' },
  // 2do bimestre (Mar-Abr) → vence Mayo
  { tipo_impuesto:'IVA_BIMESTRAL', año:2026, mes:5, dia_vencimiento:12, fecha_vencimiento:'2026-05-12', digitos_nit:'1', descripcion:'IVA Bimestral Mar-Abr 2026 — NIT 1' },
  { tipo_impuesto:'IVA_BIMESTRAL', año:2026, mes:5, dia_vencimiento:13, fecha_vencimiento:'2026-05-13', digitos_nit:'2', descripcion:'IVA Bimestral Mar-Abr 2026 — NIT 2' },
  { tipo_impuesto:'IVA_BIMESTRAL', año:2026, mes:5, dia_vencimiento:14, fecha_vencimiento:'2026-05-14', digitos_nit:'3', descripcion:'IVA Bimestral Mar-Abr 2026 — NIT 3' },
  { tipo_impuesto:'IVA_BIMESTRAL', año:2026, mes:5, dia_vencimiento:15, fecha_vencimiento:'2026-05-15', digitos_nit:'4', descripcion:'IVA Bimestral Mar-Abr 2026 — NIT 4' },
  { tipo_impuesto:'IVA_BIMESTRAL', año:2026, mes:5, dia_vencimiento:19, fecha_vencimiento:'2026-05-19', digitos_nit:'5', descripcion:'IVA Bimestral Mar-Abr 2026 — NIT 5' },
  { tipo_impuesto:'IVA_BIMESTRAL', año:2026, mes:5, dia_vencimiento:20, fecha_vencimiento:'2026-05-20', digitos_nit:'6', descripcion:'IVA Bimestral Mar-Abr 2026 — NIT 6' },
  { tipo_impuesto:'IVA_BIMESTRAL', año:2026, mes:5, dia_vencimiento:21, fecha_vencimiento:'2026-05-21', digitos_nit:'7', descripcion:'IVA Bimestral Mar-Abr 2026 — NIT 7' },
  { tipo_impuesto:'IVA_BIMESTRAL', año:2026, mes:5, dia_vencimiento:22, fecha_vencimiento:'2026-05-22', digitos_nit:'8', descripcion:'IVA Bimestral Mar-Abr 2026 — NIT 8' },
  { tipo_impuesto:'IVA_BIMESTRAL', año:2026, mes:5, dia_vencimiento:25, fecha_vencimiento:'2026-05-25', digitos_nit:'9', descripcion:'IVA Bimestral Mar-Abr 2026 — NIT 9' },
  { tipo_impuesto:'IVA_BIMESTRAL', año:2026, mes:5, dia_vencimiento:26, fecha_vencimiento:'2026-05-26', digitos_nit:'0', descripcion:'IVA Bimestral Mar-Abr 2026 — NIT 0' },
  // 3er bimestre (May-Jun) → vence Julio
  { tipo_impuesto:'IVA_BIMESTRAL', año:2026, mes:7, dia_vencimiento:9,  fecha_vencimiento:'2026-07-09', digitos_nit:'1', descripcion:'IVA Bimestral May-Jun 2026 — NIT 1' },
  { tipo_impuesto:'IVA_BIMESTRAL', año:2026, mes:7, dia_vencimiento:10, fecha_vencimiento:'2026-07-10', digitos_nit:'2', descripcion:'IVA Bimestral May-Jun 2026 — NIT 2' },
  { tipo_impuesto:'IVA_BIMESTRAL', año:2026, mes:7, dia_vencimiento:13, fecha_vencimiento:'2026-07-13', digitos_nit:'3', descripcion:'IVA Bimestral May-Jun 2026 — NIT 3' },
  { tipo_impuesto:'IVA_BIMESTRAL', año:2026, mes:7, dia_vencimiento:14, fecha_vencimiento:'2026-07-14', digitos_nit:'4', descripcion:'IVA Bimestral May-Jun 2026 — NIT 4' },
  { tipo_impuesto:'IVA_BIMESTRAL', año:2026, mes:7, dia_vencimiento:15, fecha_vencimiento:'2026-07-15', digitos_nit:'5', descripcion:'IVA Bimestral May-Jun 2026 — NIT 5' },
  { tipo_impuesto:'IVA_BIMESTRAL', año:2026, mes:7, dia_vencimiento:16, fecha_vencimiento:'2026-07-16', digitos_nit:'6', descripcion:'IVA Bimestral May-Jun 2026 — NIT 6' },
  { tipo_impuesto:'IVA_BIMESTRAL', año:2026, mes:7, dia_vencimiento:17, fecha_vencimiento:'2026-07-17', digitos_nit:'7', descripcion:'IVA Bimestral May-Jun 2026 — NIT 7' },
  { tipo_impuesto:'IVA_BIMESTRAL', año:2026, mes:7, dia_vencimiento:21, fecha_vencimiento:'2026-07-21', digitos_nit:'8', descripcion:'IVA Bimestral May-Jun 2026 — NIT 8' },
  { tipo_impuesto:'IVA_BIMESTRAL', año:2026, mes:7, dia_vencimiento:22, fecha_vencimiento:'2026-07-22', digitos_nit:'9', descripcion:'IVA Bimestral May-Jun 2026 — NIT 9' },
  { tipo_impuesto:'IVA_BIMESTRAL', año:2026, mes:7, dia_vencimiento:23, fecha_vencimiento:'2026-07-23', digitos_nit:'0', descripcion:'IVA Bimestral May-Jun 2026 — NIT 0' },
  // 4to bimestre (Jul-Ago) → vence Septiembre
  { tipo_impuesto:'IVA_BIMESTRAL', año:2026, mes:9, dia_vencimiento:9,  fecha_vencimiento:'2026-09-09', digitos_nit:'1', descripcion:'IVA Bimestral Jul-Ago 2026 — NIT 1' },
  { tipo_impuesto:'IVA_BIMESTRAL', año:2026, mes:9, dia_vencimiento:10, fecha_vencimiento:'2026-09-10', digitos_nit:'2', descripcion:'IVA Bimestral Jul-Ago 2026 — NIT 2' },
  { tipo_impuesto:'IVA_BIMESTRAL', año:2026, mes:9, dia_vencimiento:11, fecha_vencimiento:'2026-09-11', digitos_nit:'3', descripcion:'IVA Bimestral Jul-Ago 2026 — NIT 3' },
  { tipo_impuesto:'IVA_BIMESTRAL', año:2026, mes:9, dia_vencimiento:14, fecha_vencimiento:'2026-09-14', digitos_nit:'4', descripcion:'IVA Bimestral Jul-Ago 2026 — NIT 4' },
  { tipo_impuesto:'IVA_BIMESTRAL', año:2026, mes:9, dia_vencimiento:15, fecha_vencimiento:'2026-09-15', digitos_nit:'5', descripcion:'IVA Bimestral Jul-Ago 2026 — NIT 5' },
  { tipo_impuesto:'IVA_BIMESTRAL', año:2026, mes:9, dia_vencimiento:16, fecha_vencimiento:'2026-09-16', digitos_nit:'6', descripcion:'IVA Bimestral Jul-Ago 2026 — NIT 6' },
  { tipo_impuesto:'IVA_BIMESTRAL', año:2026, mes:9, dia_vencimiento:17, fecha_vencimiento:'2026-09-17', digitos_nit:'7', descripcion:'IVA Bimestral Jul-Ago 2026 — NIT 7' },
  { tipo_impuesto:'IVA_BIMESTRAL', año:2026, mes:9, dia_vencimiento:18, fecha_vencimiento:'2026-09-18', digitos_nit:'8', descripcion:'IVA Bimestral Jul-Ago 2026 — NIT 8' },
  { tipo_impuesto:'IVA_BIMESTRAL', año:2026, mes:9, dia_vencimiento:21, fecha_vencimiento:'2026-09-21', digitos_nit:'9', descripcion:'IVA Bimestral Jul-Ago 2026 — NIT 9' },
  { tipo_impuesto:'IVA_BIMESTRAL', año:2026, mes:9, dia_vencimiento:22, fecha_vencimiento:'2026-09-22', digitos_nit:'0', descripcion:'IVA Bimestral Jul-Ago 2026 — NIT 0' },
  // 5to bimestre (Sep-Oct) → vence Noviembre
  { tipo_impuesto:'IVA_BIMESTRAL', año:2026, mes:11, dia_vencimiento:11, fecha_vencimiento:'2026-11-11', digitos_nit:'1', descripcion:'IVA Bimestral Sep-Oct 2026 — NIT 1' },
  { tipo_impuesto:'IVA_BIMESTRAL', año:2026, mes:11, dia_vencimiento:12, fecha_vencimiento:'2026-11-12', digitos_nit:'2', descripcion:'IVA Bimestral Sep-Oct 2026 — NIT 2' },
  { tipo_impuesto:'IVA_BIMESTRAL', año:2026, mes:11, dia_vencimiento:13, fecha_vencimiento:'2026-11-13', digitos_nit:'3', descripcion:'IVA Bimestral Sep-Oct 2026 — NIT 3' },
  { tipo_impuesto:'IVA_BIMESTRAL', año:2026, mes:11, dia_vencimiento:17, fecha_vencimiento:'2026-11-17', digitos_nit:'4', descripcion:'IVA Bimestral Sep-Oct 2026 — NIT 4' },
  { tipo_impuesto:'IVA_BIMESTRAL', año:2026, mes:11, dia_vencimiento:18, fecha_vencimiento:'2026-11-18', digitos_nit:'5', descripcion:'IVA Bimestral Sep-Oct 2026 — NIT 5' },
  { tipo_impuesto:'IVA_BIMESTRAL', año:2026, mes:11, dia_vencimiento:19, fecha_vencimiento:'2026-11-19', digitos_nit:'6', descripcion:'IVA Bimestral Sep-Oct 2026 — NIT 6' },
  { tipo_impuesto:'IVA_BIMESTRAL', año:2026, mes:11, dia_vencimiento:20, fecha_vencimiento:'2026-11-20', digitos_nit:'7', descripcion:'IVA Bimestral Sep-Oct 2026 — NIT 7' },
  { tipo_impuesto:'IVA_BIMESTRAL', año:2026, mes:11, dia_vencimiento:23, fecha_vencimiento:'2026-11-23', digitos_nit:'8', descripcion:'IVA Bimestral Sep-Oct 2026 — NIT 8' },
  { tipo_impuesto:'IVA_BIMESTRAL', año:2026, mes:11, dia_vencimiento:24, fecha_vencimiento:'2026-11-24', digitos_nit:'9', descripcion:'IVA Bimestral Sep-Oct 2026 — NIT 9' },
  { tipo_impuesto:'IVA_BIMESTRAL', año:2026, mes:11, dia_vencimiento:25, fecha_vencimiento:'2026-11-25', digitos_nit:'0', descripcion:'IVA Bimestral Sep-Oct 2026 — NIT 0' },
  // 6to bimestre (Nov-Dic) → vence Enero 2027 (Boletín CALA 2026)
  { tipo_impuesto:'IVA_BIMESTRAL', año:2026, mes:1, dia_vencimiento:13, fecha_vencimiento:'2027-01-13', digitos_nit:'1', descripcion:'IVA Bimestral Nov-Dic 2026 — NIT 1' },
  { tipo_impuesto:'IVA_BIMESTRAL', año:2026, mes:1, dia_vencimiento:14, fecha_vencimiento:'2027-01-14', digitos_nit:'2', descripcion:'IVA Bimestral Nov-Dic 2026 — NIT 2' },
  { tipo_impuesto:'IVA_BIMESTRAL', año:2026, mes:1, dia_vencimiento:15, fecha_vencimiento:'2027-01-15', digitos_nit:'3', descripcion:'IVA Bimestral Nov-Dic 2026 — NIT 3' },
  { tipo_impuesto:'IVA_BIMESTRAL', año:2026, mes:1, dia_vencimiento:18, fecha_vencimiento:'2027-01-18', digitos_nit:'4', descripcion:'IVA Bimestral Nov-Dic 2026 — NIT 4' },
  { tipo_impuesto:'IVA_BIMESTRAL', año:2026, mes:1, dia_vencimiento:19, fecha_vencimiento:'2027-01-19', digitos_nit:'5', descripcion:'IVA Bimestral Nov-Dic 2026 — NIT 5' },
  { tipo_impuesto:'IVA_BIMESTRAL', año:2026, mes:1, dia_vencimiento:20, fecha_vencimiento:'2027-01-20', digitos_nit:'6', descripcion:'IVA Bimestral Nov-Dic 2026 — NIT 6' },
  { tipo_impuesto:'IVA_BIMESTRAL', año:2026, mes:1, dia_vencimiento:21, fecha_vencimiento:'2027-01-21', digitos_nit:'7', descripcion:'IVA Bimestral Nov-Dic 2026 — NIT 7' },
  { tipo_impuesto:'IVA_BIMESTRAL', año:2026, mes:1, dia_vencimiento:22, fecha_vencimiento:'2027-01-22', digitos_nit:'8', descripcion:'IVA Bimestral Nov-Dic 2026 — NIT 8' },
  { tipo_impuesto:'IVA_BIMESTRAL', año:2026, mes:1, dia_vencimiento:25, fecha_vencimiento:'2027-01-25', digitos_nit:'9', descripcion:'IVA Bimestral Nov-Dic 2026 — NIT 9' },
  { tipo_impuesto:'IVA_BIMESTRAL', año:2026, mes:1, dia_vencimiento:26, fecha_vencimiento:'2027-01-26', digitos_nit:'0', descripcion:'IVA Bimestral Nov-Dic 2026 — NIT 0' },
  // ── IVA ANUAL RST ──────────────────────────────────────────────────────────
  { tipo_impuesto:'IVA_ANUAL', año:2026, mes:2, dia_vencimiento:16, fecha_vencimiento:'2026-02-16', digitos_nit:'1-2', descripcion:'IVA Anual RST 2025 — NIT termina en 1 o 2' },
  { tipo_impuesto:'IVA_ANUAL', año:2026, mes:2, dia_vencimiento:17, fecha_vencimiento:'2026-02-17', digitos_nit:'3-4', descripcion:'IVA Anual RST 2025 — NIT termina en 3 o 4' },
  { tipo_impuesto:'IVA_ANUAL', año:2026, mes:2, dia_vencimiento:18, fecha_vencimiento:'2026-02-18', digitos_nit:'5-6', descripcion:'IVA Anual RST 2025 — NIT termina en 5 o 6' },
  { tipo_impuesto:'IVA_ANUAL', año:2026, mes:2, dia_vencimiento:19, fecha_vencimiento:'2026-02-19', digitos_nit:'7-8', descripcion:'IVA Anual RST 2025 — NIT termina en 7 o 8' },
  { tipo_impuesto:'IVA_ANUAL', año:2026, mes:2, dia_vencimiento:20, fecha_vencimiento:'2026-02-20', digitos_nit:'9-0', descripcion:'IVA Anual RST 2025 — NIT termina en 9 o 0' },
  // ── RENTA GRANDES CONTRIBUYENTES (año gravable 2025) ── 3 cuotas ───────────
  // 1ra cuota → vence Febrero
  { tipo_impuesto:'RENTA_BIMESTRAL_ANTICIPO', año:2026, mes:2, dia_vencimiento:10, fecha_vencimiento:'2026-02-10', digitos_nit:'1', descripcion:'Renta 2025 Grandes Contribuyentes — 1ra cuota NIT 1' },
  { tipo_impuesto:'RENTA_BIMESTRAL_ANTICIPO', año:2026, mes:2, dia_vencimiento:11, fecha_vencimiento:'2026-02-11', digitos_nit:'2', descripcion:'Renta 2025 Grandes Contribuyentes — 1ra cuota NIT 2' },
  { tipo_impuesto:'RENTA_BIMESTRAL_ANTICIPO', año:2026, mes:2, dia_vencimiento:12, fecha_vencimiento:'2026-02-12', digitos_nit:'3', descripcion:'Renta 2025 Grandes Contribuyentes — 1ra cuota NIT 3' },
  { tipo_impuesto:'RENTA_BIMESTRAL_ANTICIPO', año:2026, mes:2, dia_vencimiento:13, fecha_vencimiento:'2026-02-13', digitos_nit:'4', descripcion:'Renta 2025 Grandes Contribuyentes — 1ra cuota NIT 4' },
  { tipo_impuesto:'RENTA_BIMESTRAL_ANTICIPO', año:2026, mes:2, dia_vencimiento:16, fecha_vencimiento:'2026-02-16', digitos_nit:'5', descripcion:'Renta 2025 Grandes Contribuyentes — 1ra cuota NIT 5' },
  { tipo_impuesto:'RENTA_BIMESTRAL_ANTICIPO', año:2026, mes:2, dia_vencimiento:17, fecha_vencimiento:'2026-02-17', digitos_nit:'6', descripcion:'Renta 2025 Grandes Contribuyentes — 1ra cuota NIT 6' },
  { tipo_impuesto:'RENTA_BIMESTRAL_ANTICIPO', año:2026, mes:2, dia_vencimiento:18, fecha_vencimiento:'2026-02-18', digitos_nit:'7', descripcion:'Renta 2025 Grandes Contribuyentes — 1ra cuota NIT 7' },
  { tipo_impuesto:'RENTA_BIMESTRAL_ANTICIPO', año:2026, mes:2, dia_vencimiento:19, fecha_vencimiento:'2026-02-19', digitos_nit:'8', descripcion:'Renta 2025 Grandes Contribuyentes — 1ra cuota NIT 8' },
  { tipo_impuesto:'RENTA_BIMESTRAL_ANTICIPO', año:2026, mes:2, dia_vencimiento:20, fecha_vencimiento:'2026-02-20', digitos_nit:'9', descripcion:'Renta 2025 Grandes Contribuyentes — 1ra cuota NIT 9' },
  { tipo_impuesto:'RENTA_BIMESTRAL_ANTICIPO', año:2026, mes:2, dia_vencimiento:23, fecha_vencimiento:'2026-02-23', digitos_nit:'0', descripcion:'Renta 2025 Grandes Contribuyentes — 1ra cuota NIT 0' },
  // 2da cuota → vence Abril
  { tipo_impuesto:'RENTA_BIMESTRAL_ANTICIPO', año:2026, mes:4, dia_vencimiento:13, fecha_vencimiento:'2026-04-13', digitos_nit:'1', descripcion:'Renta 2025 Grandes Contribuyentes — 2da cuota NIT 1' },
  { tipo_impuesto:'RENTA_BIMESTRAL_ANTICIPO', año:2026, mes:4, dia_vencimiento:14, fecha_vencimiento:'2026-04-14', digitos_nit:'2', descripcion:'Renta 2025 Grandes Contribuyentes — 2da cuota NIT 2' },
  { tipo_impuesto:'RENTA_BIMESTRAL_ANTICIPO', año:2026, mes:4, dia_vencimiento:15, fecha_vencimiento:'2026-04-15', digitos_nit:'3', descripcion:'Renta 2025 Grandes Contribuyentes — 2da cuota NIT 3' },
  { tipo_impuesto:'RENTA_BIMESTRAL_ANTICIPO', año:2026, mes:4, dia_vencimiento:16, fecha_vencimiento:'2026-04-16', digitos_nit:'4', descripcion:'Renta 2025 Grandes Contribuyentes — 2da cuota NIT 4' },
  { tipo_impuesto:'RENTA_BIMESTRAL_ANTICIPO', año:2026, mes:4, dia_vencimiento:17, fecha_vencimiento:'2026-04-17', digitos_nit:'5', descripcion:'Renta 2025 Grandes Contribuyentes — 2da cuota NIT 5' },
  { tipo_impuesto:'RENTA_BIMESTRAL_ANTICIPO', año:2026, mes:4, dia_vencimiento:20, fecha_vencimiento:'2026-04-20', digitos_nit:'6', descripcion:'Renta 2025 Grandes Contribuyentes — 2da cuota NIT 6' },
  { tipo_impuesto:'RENTA_BIMESTRAL_ANTICIPO', año:2026, mes:4, dia_vencimiento:21, fecha_vencimiento:'2026-04-21', digitos_nit:'7', descripcion:'Renta 2025 Grandes Contribuyentes — 2da cuota NIT 7' },
  { tipo_impuesto:'RENTA_BIMESTRAL_ANTICIPO', año:2026, mes:4, dia_vencimiento:22, fecha_vencimiento:'2026-04-22', digitos_nit:'8', descripcion:'Renta 2025 Grandes Contribuyentes — 2da cuota NIT 8' },
  { tipo_impuesto:'RENTA_BIMESTRAL_ANTICIPO', año:2026, mes:4, dia_vencimiento:23, fecha_vencimiento:'2026-04-23', digitos_nit:'9', descripcion:'Renta 2025 Grandes Contribuyentes — 2da cuota NIT 9' },
  { tipo_impuesto:'RENTA_BIMESTRAL_ANTICIPO', año:2026, mes:4, dia_vencimiento:24, fecha_vencimiento:'2026-04-24', digitos_nit:'0', descripcion:'Renta 2025 Grandes Contribuyentes — 2da cuota NIT 0' },
  // 3ra cuota → vence Junio
  { tipo_impuesto:'RENTA_BIMESTRAL_ANTICIPO', año:2026, mes:6, dia_vencimiento:10, fecha_vencimiento:'2026-06-10', digitos_nit:'1', descripcion:'Renta 2025 Grandes Contribuyentes — 3ra cuota NIT 1' },
  { tipo_impuesto:'RENTA_BIMESTRAL_ANTICIPO', año:2026, mes:6, dia_vencimiento:11, fecha_vencimiento:'2026-06-11', digitos_nit:'2', descripcion:'Renta 2025 Grandes Contribuyentes — 3ra cuota NIT 2' },
  { tipo_impuesto:'RENTA_BIMESTRAL_ANTICIPO', año:2026, mes:6, dia_vencimiento:12, fecha_vencimiento:'2026-06-12', digitos_nit:'3', descripcion:'Renta 2025 Grandes Contribuyentes — 3ra cuota NIT 3' },
  { tipo_impuesto:'RENTA_BIMESTRAL_ANTICIPO', año:2026, mes:6, dia_vencimiento:16, fecha_vencimiento:'2026-06-16', digitos_nit:'4', descripcion:'Renta 2025 Grandes Contribuyentes — 3ra cuota NIT 4' },
  { tipo_impuesto:'RENTA_BIMESTRAL_ANTICIPO', año:2026, mes:6, dia_vencimiento:17, fecha_vencimiento:'2026-06-17', digitos_nit:'5', descripcion:'Renta 2025 Grandes Contribuyentes — 3ra cuota NIT 5' },
  { tipo_impuesto:'RENTA_BIMESTRAL_ANTICIPO', año:2026, mes:6, dia_vencimiento:18, fecha_vencimiento:'2026-06-18', digitos_nit:'6', descripcion:'Renta 2025 Grandes Contribuyentes — 3ra cuota NIT 6' },
  { tipo_impuesto:'RENTA_BIMESTRAL_ANTICIPO', año:2026, mes:6, dia_vencimiento:19, fecha_vencimiento:'2026-06-19', digitos_nit:'7', descripcion:'Renta 2025 Grandes Contribuyentes — 3ra cuota NIT 7' },
  { tipo_impuesto:'RENTA_BIMESTRAL_ANTICIPO', año:2026, mes:6, dia_vencimiento:22, fecha_vencimiento:'2026-06-22', digitos_nit:'8', descripcion:'Renta 2025 Grandes Contribuyentes — 3ra cuota NIT 8' },
  { tipo_impuesto:'RENTA_BIMESTRAL_ANTICIPO', año:2026, mes:6, dia_vencimiento:23, fecha_vencimiento:'2026-06-23', digitos_nit:'9', descripcion:'Renta 2025 Grandes Contribuyentes — 3ra cuota NIT 9' },
  { tipo_impuesto:'RENTA_BIMESTRAL_ANTICIPO', año:2026, mes:6, dia_vencimiento:24, fecha_vencimiento:'2026-06-24', digitos_nit:'0', descripcion:'Renta 2025 Grandes Contribuyentes — 3ra cuota NIT 0' },
  // ── RENTA ANUAL P.J. (año gravable 2025) ── por último dígito NIT ──────────
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:5, dia_vencimiento:12, fecha_vencimiento:'2026-05-12', digitos_nit:'1', descripcion:'Renta 2025 P.J. — NIT termina en 1' },
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:5, dia_vencimiento:13, fecha_vencimiento:'2026-05-13', digitos_nit:'2', descripcion:'Renta 2025 P.J. — NIT termina en 2' },
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:5, dia_vencimiento:14, fecha_vencimiento:'2026-05-14', digitos_nit:'3', descripcion:'Renta 2025 P.J. — NIT termina en 3' },
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:5, dia_vencimiento:15, fecha_vencimiento:'2026-05-15', digitos_nit:'4', descripcion:'Renta 2025 P.J. — NIT termina en 4' },
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:5, dia_vencimiento:19, fecha_vencimiento:'2026-05-19', digitos_nit:'5', descripcion:'Renta 2025 P.J. — NIT termina en 5' },
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:5, dia_vencimiento:20, fecha_vencimiento:'2026-05-20', digitos_nit:'6', descripcion:'Renta 2025 P.J. — NIT termina en 6' },
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:5, dia_vencimiento:21, fecha_vencimiento:'2026-05-21', digitos_nit:'7', descripcion:'Renta 2025 P.J. — NIT termina en 7' },
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:5, dia_vencimiento:22, fecha_vencimiento:'2026-05-22', digitos_nit:'8', descripcion:'Renta 2025 P.J. — NIT termina en 8' },
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:5, dia_vencimiento:25, fecha_vencimiento:'2026-05-25', digitos_nit:'9', descripcion:'Renta 2025 P.J. — NIT termina en 9' },
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:5, dia_vencimiento:26, fecha_vencimiento:'2026-05-26', digitos_nit:'0', descripcion:'Renta 2025 P.J. — NIT termina en 0' },
  // ── RENTA ANUAL P.N. (año gravable 2025) ── por dos últimos dígitos NIT ────
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:8,  dia_vencimiento:12, fecha_vencimiento:'2026-08-12', digitos_nit:'01-02', descripcion:'Renta 2025 P.N. — NIT 01-02' },
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:8,  dia_vencimiento:13, fecha_vencimiento:'2026-08-13', digitos_nit:'03-04', descripcion:'Renta 2025 P.N. — NIT 03-04' },
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:8,  dia_vencimiento:14, fecha_vencimiento:'2026-08-14', digitos_nit:'05-06', descripcion:'Renta 2025 P.N. — NIT 05-06' },
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:8,  dia_vencimiento:18, fecha_vencimiento:'2026-08-18', digitos_nit:'07-08', descripcion:'Renta 2025 P.N. — NIT 07-08' },
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:8,  dia_vencimiento:19, fecha_vencimiento:'2026-08-19', digitos_nit:'09-10', descripcion:'Renta 2025 P.N. — NIT 09-10' },
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:8,  dia_vencimiento:20, fecha_vencimiento:'2026-08-20', digitos_nit:'11-12', descripcion:'Renta 2025 P.N. — NIT 11-12' },
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:8,  dia_vencimiento:21, fecha_vencimiento:'2026-08-21', digitos_nit:'13-14', descripcion:'Renta 2025 P.N. — NIT 13-14' },
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:8,  dia_vencimiento:24, fecha_vencimiento:'2026-08-24', digitos_nit:'15-16', descripcion:'Renta 2025 P.N. — NIT 15-16' },
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:8,  dia_vencimiento:25, fecha_vencimiento:'2026-08-25', digitos_nit:'17-18', descripcion:'Renta 2025 P.N. — NIT 17-18' },
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:8,  dia_vencimiento:26, fecha_vencimiento:'2026-08-26', digitos_nit:'19-20', descripcion:'Renta 2025 P.N. — NIT 19-20' },
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:8,  dia_vencimiento:27, fecha_vencimiento:'2026-08-27', digitos_nit:'21-22', descripcion:'Renta 2025 P.N. — NIT 21-22' },
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:8,  dia_vencimiento:28, fecha_vencimiento:'2026-08-28', digitos_nit:'23-24', descripcion:'Renta 2025 P.N. — NIT 23-24' },
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:8,  dia_vencimiento:31, fecha_vencimiento:'2026-08-31', digitos_nit:'25-26', descripcion:'Renta 2025 P.N. — NIT 25-26' },
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:9,  dia_vencimiento:1,  fecha_vencimiento:'2026-09-01', digitos_nit:'27-28', descripcion:'Renta 2025 P.N. — NIT 27-28' },
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:9,  dia_vencimiento:2,  fecha_vencimiento:'2026-09-02', digitos_nit:'29-30', descripcion:'Renta 2025 P.N. — NIT 29-30' },
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:9,  dia_vencimiento:3,  fecha_vencimiento:'2026-09-03', digitos_nit:'31-32', descripcion:'Renta 2025 P.N. — NIT 31-32' },
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:9,  dia_vencimiento:4,  fecha_vencimiento:'2026-09-04', digitos_nit:'33-34', descripcion:'Renta 2025 P.N. — NIT 33-34' },
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:9,  dia_vencimiento:7,  fecha_vencimiento:'2026-09-07', digitos_nit:'35-36', descripcion:'Renta 2025 P.N. — NIT 35-36' },
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:9,  dia_vencimiento:8,  fecha_vencimiento:'2026-09-08', digitos_nit:'37-38', descripcion:'Renta 2025 P.N. — NIT 37-38' },
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:9,  dia_vencimiento:9,  fecha_vencimiento:'2026-09-09', digitos_nit:'39-40', descripcion:'Renta 2025 P.N. — NIT 39-40' },
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:9,  dia_vencimiento:10, fecha_vencimiento:'2026-09-10', digitos_nit:'41-42', descripcion:'Renta 2025 P.N. — NIT 41-42' },
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:9,  dia_vencimiento:11, fecha_vencimiento:'2026-09-11', digitos_nit:'43-44', descripcion:'Renta 2025 P.N. — NIT 43-44' },
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:9,  dia_vencimiento:14, fecha_vencimiento:'2026-09-14', digitos_nit:'45-46', descripcion:'Renta 2025 P.N. — NIT 45-46' },
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:9,  dia_vencimiento:15, fecha_vencimiento:'2026-09-15', digitos_nit:'47-48', descripcion:'Renta 2025 P.N. — NIT 47-48' },
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:9,  dia_vencimiento:16, fecha_vencimiento:'2026-09-16', digitos_nit:'49-50', descripcion:'Renta 2025 P.N. — NIT 49-50' },
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:9,  dia_vencimiento:17, fecha_vencimiento:'2026-09-17', digitos_nit:'51-52', descripcion:'Renta 2025 P.N. — NIT 51-52' },
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:9,  dia_vencimiento:18, fecha_vencimiento:'2026-09-18', digitos_nit:'53-54', descripcion:'Renta 2025 P.N. — NIT 53-54' },
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:9,  dia_vencimiento:21, fecha_vencimiento:'2026-09-21', digitos_nit:'55-56', descripcion:'Renta 2025 P.N. — NIT 55-56' },
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:9,  dia_vencimiento:22, fecha_vencimiento:'2026-09-22', digitos_nit:'57-58', descripcion:'Renta 2025 P.N. — NIT 57-58' },
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:9,  dia_vencimiento:23, fecha_vencimiento:'2026-09-23', digitos_nit:'59-60', descripcion:'Renta 2025 P.N. — NIT 59-60' },
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:9,  dia_vencimiento:24, fecha_vencimiento:'2026-09-24', digitos_nit:'61-62', descripcion:'Renta 2025 P.N. — NIT 61-62' },
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:9,  dia_vencimiento:25, fecha_vencimiento:'2026-09-25', digitos_nit:'63-64', descripcion:'Renta 2025 P.N. — NIT 63-64' },
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:9,  dia_vencimiento:28, fecha_vencimiento:'2026-09-28', digitos_nit:'65-66', descripcion:'Renta 2025 P.N. — NIT 65-66' },
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:10, dia_vencimiento:1,  fecha_vencimiento:'2026-10-01', digitos_nit:'67-68', descripcion:'Renta 2025 P.N. — NIT 67-68' },
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:10, dia_vencimiento:2,  fecha_vencimiento:'2026-10-02', digitos_nit:'69-70', descripcion:'Renta 2025 P.N. — NIT 69-70' },
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:10, dia_vencimiento:5,  fecha_vencimiento:'2026-10-05', digitos_nit:'71-72', descripcion:'Renta 2025 P.N. — NIT 71-72' },
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:10, dia_vencimiento:6,  fecha_vencimiento:'2026-10-06', digitos_nit:'73-74', descripcion:'Renta 2025 P.N. — NIT 73-74' },
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:10, dia_vencimiento:7,  fecha_vencimiento:'2026-10-07', digitos_nit:'75-76', descripcion:'Renta 2025 P.N. — NIT 75-76' },
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:10, dia_vencimiento:8,  fecha_vencimiento:'2026-10-08', digitos_nit:'77-78', descripcion:'Renta 2025 P.N. — NIT 77-78' },
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:10, dia_vencimiento:9,  fecha_vencimiento:'2026-10-09', digitos_nit:'79-80', descripcion:'Renta 2025 P.N. — NIT 79-80' },
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:10, dia_vencimiento:13, fecha_vencimiento:'2026-10-13', digitos_nit:'81-82', descripcion:'Renta 2025 P.N. — NIT 81-82' },
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:10, dia_vencimiento:14, fecha_vencimiento:'2026-10-14', digitos_nit:'83-84', descripcion:'Renta 2025 P.N. — NIT 83-84' },
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:10, dia_vencimiento:15, fecha_vencimiento:'2026-10-15', digitos_nit:'85-86', descripcion:'Renta 2025 P.N. — NIT 85-86' },
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:10, dia_vencimiento:16, fecha_vencimiento:'2026-10-16', digitos_nit:'87-88', descripcion:'Renta 2025 P.N. — NIT 87-88' },
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:10, dia_vencimiento:19, fecha_vencimiento:'2026-10-19', digitos_nit:'89-90', descripcion:'Renta 2025 P.N. — NIT 89-90' },
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:10, dia_vencimiento:20, fecha_vencimiento:'2026-10-20', digitos_nit:'91-92', descripcion:'Renta 2025 P.N. — NIT 91-92' },
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:10, dia_vencimiento:21, fecha_vencimiento:'2026-10-21', digitos_nit:'93-94', descripcion:'Renta 2025 P.N. — NIT 93-94' },
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:10, dia_vencimiento:22, fecha_vencimiento:'2026-10-22', digitos_nit:'95-96', descripcion:'Renta 2025 P.N. — NIT 95-96' },
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:10, dia_vencimiento:23, fecha_vencimiento:'2026-10-23', digitos_nit:'97-98', descripcion:'Renta 2025 P.N. — NIT 97-98' },
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:10, dia_vencimiento:26, fecha_vencimiento:'2026-10-26', digitos_nit:'99-00', descripcion:'Renta 2025 P.N. — NIT 99-00' },
  // ── EXÓGENA AÑO GRAVABLE 2025 ─────────────────────────────────────────────
  { tipo_impuesto:'EXOGENA_ANUAL', año:2026, mes:4, dia_vencimiento:27, fecha_vencimiento:'2026-04-27', digitos_nit:'1', descripcion:'Exógena 2025 — NIT termina en 1' },
  { tipo_impuesto:'EXOGENA_ANUAL', año:2026, mes:4, dia_vencimiento:28, fecha_vencimiento:'2026-04-28', digitos_nit:'2', descripcion:'Exógena 2025 — NIT termina en 2' },
  { tipo_impuesto:'EXOGENA_ANUAL', año:2026, mes:5, dia_vencimiento:4,  fecha_vencimiento:'2026-05-04', digitos_nit:'3', descripcion:'Exógena 2025 — NIT termina en 3' },
  { tipo_impuesto:'EXOGENA_ANUAL', año:2026, mes:5, dia_vencimiento:5,  fecha_vencimiento:'2026-05-05', digitos_nit:'4', descripcion:'Exógena 2025 — NIT termina en 4' },
  { tipo_impuesto:'EXOGENA_ANUAL', año:2026, mes:5, dia_vencimiento:6,  fecha_vencimiento:'2026-05-06', digitos_nit:'5', descripcion:'Exógena 2025 — NIT termina en 5' },
  { tipo_impuesto:'EXOGENA_ANUAL', año:2026, mes:5, dia_vencimiento:7,  fecha_vencimiento:'2026-05-07', digitos_nit:'6', descripcion:'Exógena 2025 — NIT termina en 6' },
  { tipo_impuesto:'EXOGENA_ANUAL', año:2026, mes:5, dia_vencimiento:8,  fecha_vencimiento:'2026-05-08', digitos_nit:'7', descripcion:'Exógena 2025 — NIT termina en 7' },
  { tipo_impuesto:'EXOGENA_ANUAL', año:2026, mes:5, dia_vencimiento:11, fecha_vencimiento:'2026-05-11', digitos_nit:'8', descripcion:'Exógena 2025 — NIT termina en 8' },
  { tipo_impuesto:'EXOGENA_ANUAL', año:2026, mes:5, dia_vencimiento:12, fecha_vencimiento:'2026-05-12', digitos_nit:'9', descripcion:'Exógena 2025 — NIT termina en 9' },
  { tipo_impuesto:'EXOGENA_ANUAL', año:2026, mes:5, dia_vencimiento:13, fecha_vencimiento:'2026-05-13', digitos_nit:'0', descripcion:'Exógena 2025 — NIT termina en 0' },
  // ── EXÓGENA AÑO GRAVABLE 2025 — P.J. y P.N. ── por dos últimos dígitos NIT ─
  { tipo_impuesto:'EXOGENA_ANUAL', año:2026, mes:5,  dia_vencimiento:14, fecha_vencimiento:'2026-05-14', digitos_nit:'01-05', descripcion:'Exógena 2025 P.J./P.N. — NIT 01-05' },
  { tipo_impuesto:'EXOGENA_ANUAL', año:2026, mes:5,  dia_vencimiento:15, fecha_vencimiento:'2026-05-15', digitos_nit:'06-10', descripcion:'Exógena 2025 P.J./P.N. — NIT 06-10' },
  { tipo_impuesto:'EXOGENA_ANUAL', año:2026, mes:5,  dia_vencimiento:19, fecha_vencimiento:'2026-05-19', digitos_nit:'11-15', descripcion:'Exógena 2025 P.J./P.N. — NIT 11-15' },
  { tipo_impuesto:'EXOGENA_ANUAL', año:2026, mes:5,  dia_vencimiento:20, fecha_vencimiento:'2026-05-20', digitos_nit:'16-20', descripcion:'Exógena 2025 P.J./P.N. — NIT 16-20' },
  { tipo_impuesto:'EXOGENA_ANUAL', año:2026, mes:5,  dia_vencimiento:21, fecha_vencimiento:'2026-05-21', digitos_nit:'21-25', descripcion:'Exógena 2025 P.J./P.N. — NIT 21-25' },
  { tipo_impuesto:'EXOGENA_ANUAL', año:2026, mes:5,  dia_vencimiento:22, fecha_vencimiento:'2026-05-22', digitos_nit:'26-30', descripcion:'Exógena 2025 P.J./P.N. — NIT 26-30' },
  { tipo_impuesto:'EXOGENA_ANUAL', año:2026, mes:5,  dia_vencimiento:25, fecha_vencimiento:'2026-05-25', digitos_nit:'31-35', descripcion:'Exógena 2025 P.J./P.N. — NIT 31-35' },
  { tipo_impuesto:'EXOGENA_ANUAL', año:2026, mes:5,  dia_vencimiento:26, fecha_vencimiento:'2026-05-26', digitos_nit:'36-40', descripcion:'Exógena 2025 P.J./P.N. — NIT 36-40' },
  { tipo_impuesto:'EXOGENA_ANUAL', año:2026, mes:5,  dia_vencimiento:27, fecha_vencimiento:'2026-05-27', digitos_nit:'41-45', descripcion:'Exógena 2025 P.J./P.N. — NIT 41-45' },
  { tipo_impuesto:'EXOGENA_ANUAL', año:2026, mes:5,  dia_vencimiento:28, fecha_vencimiento:'2026-05-28', digitos_nit:'46-50', descripcion:'Exógena 2025 P.J./P.N. — NIT 46-50' },
  { tipo_impuesto:'EXOGENA_ANUAL', año:2026, mes:5,  dia_vencimiento:29, fecha_vencimiento:'2026-05-29', digitos_nit:'51-55', descripcion:'Exógena 2025 P.J./P.N. — NIT 51-55' },
  { tipo_impuesto:'EXOGENA_ANUAL', año:2026, mes:6,  dia_vencimiento:1,  fecha_vencimiento:'2026-06-01', digitos_nit:'56-60', descripcion:'Exógena 2025 P.J./P.N. — NIT 56-60' },
  { tipo_impuesto:'EXOGENA_ANUAL', año:2026, mes:6,  dia_vencimiento:2,  fecha_vencimiento:'2026-06-02', digitos_nit:'61-65', descripcion:'Exógena 2025 P.J./P.N. — NIT 61-65' },
  { tipo_impuesto:'EXOGENA_ANUAL', año:2026, mes:6,  dia_vencimiento:3,  fecha_vencimiento:'2026-06-03', digitos_nit:'66-70', descripcion:'Exógena 2025 P.J./P.N. — NIT 66-70' },
  { tipo_impuesto:'EXOGENA_ANUAL', año:2026, mes:6,  dia_vencimiento:4,  fecha_vencimiento:'2026-06-04', digitos_nit:'71-75', descripcion:'Exógena 2025 P.J./P.N. — NIT 71-75' },
  { tipo_impuesto:'EXOGENA_ANUAL', año:2026, mes:6,  dia_vencimiento:5,  fecha_vencimiento:'2026-06-05', digitos_nit:'76-80', descripcion:'Exógena 2025 P.J./P.N. — NIT 76-80' },
  { tipo_impuesto:'EXOGENA_ANUAL', año:2026, mes:6,  dia_vencimiento:9,  fecha_vencimiento:'2026-06-09', digitos_nit:'81-85', descripcion:'Exógena 2025 P.J./P.N. — NIT 81-85' },
  { tipo_impuesto:'EXOGENA_ANUAL', año:2026, mes:6,  dia_vencimiento:10, fecha_vencimiento:'2026-06-10', digitos_nit:'86-90', descripcion:'Exógena 2025 P.J./P.N. — NIT 86-90' },
  { tipo_impuesto:'EXOGENA_ANUAL', año:2026, mes:6,  dia_vencimiento:11, fecha_vencimiento:'2026-06-11', digitos_nit:'91-95', descripcion:'Exógena 2025 P.J./P.N. — NIT 91-95' },
  { tipo_impuesto:'EXOGENA_ANUAL', año:2026, mes:6,  dia_vencimiento:12, fecha_vencimiento:'2026-06-12', digitos_nit:'96-00', descripcion:'Exógena 2025 P.J./P.N. — NIT 96-00' },
  // ── ICA ANUAL ──────────────────────────────────────────────────────────────
  // ICA Anual Bogotá pequeños contribuyentes (<391 UVT) — todos vencen Feb 26
  { tipo_impuesto:'ICA_BIMESTRAL', año:2026, mes:2, dia_vencimiento:26, fecha_vencimiento:'2026-02-26', descripcion:'ICA Anual Bogotá (régimen común/preferencial < 391 UVT) — todos los NITs' },
  // ICA Anual Bogotá por grupos de NIT (régimen común)
  { tipo_impuesto:'ICA_BIMESTRAL', año:2026, mes:3, dia_vencimiento:6,  fecha_vencimiento:'2026-03-06', digitos_nit:'7-8', descripcion:'ICA Anual Bogotá — NIT termina en 7 u 8' },
  { tipo_impuesto:'ICA_BIMESTRAL', año:2026, mes:3, dia_vencimiento:13, fecha_vencimiento:'2026-03-13', digitos_nit:'5-6', descripcion:'ICA Anual Bogotá — NIT termina en 5 o 6' },
  { tipo_impuesto:'ICA_BIMESTRAL', año:2026, mes:3, dia_vencimiento:20, fecha_vencimiento:'2026-03-20', digitos_nit:'3-4', descripcion:'ICA Anual Bogotá — NIT termina en 3 o 4' },
  { tipo_impuesto:'ICA_BIMESTRAL', año:2026, mes:3, dia_vencimiento:27, fecha_vencimiento:'2026-03-27', digitos_nit:'1-2', descripcion:'ICA Anual Bogotá — NIT termina en 1 o 2' },
  { tipo_impuesto:'ICA_BIMESTRAL', año:2026, mes:4, dia_vencimiento:10, fecha_vencimiento:'2026-04-10', digitos_nit:'9-0', descripcion:'ICA Anual Bogotá — NIT termina en 9 o 0' },
  // ICA Anual Socorro (Santander) — por último dígito NIT
  { tipo_impuesto:'ICA_BIMESTRAL', año:2026, mes:3, dia_vencimiento:2,  fecha_vencimiento:'2026-03-02', digitos_nit:'1', descripcion:'ICA Anual Socorro (Santander) — NIT termina en 1' },
  { tipo_impuesto:'ICA_BIMESTRAL', año:2026, mes:3, dia_vencimiento:4,  fecha_vencimiento:'2026-03-04', digitos_nit:'2', descripcion:'ICA Anual Socorro (Santander) — NIT termina en 2' },
  { tipo_impuesto:'ICA_BIMESTRAL', año:2026, mes:3, dia_vencimiento:6,  fecha_vencimiento:'2026-03-06', digitos_nit:'3', descripcion:'ICA Anual Socorro (Santander) — NIT termina en 3' },
  { tipo_impuesto:'ICA_BIMESTRAL', año:2026, mes:3, dia_vencimiento:9,  fecha_vencimiento:'2026-03-09', digitos_nit:'4', descripcion:'ICA Anual Socorro (Santander) — NIT termina en 4' },
  { tipo_impuesto:'ICA_BIMESTRAL', año:2026, mes:3, dia_vencimiento:11, fecha_vencimiento:'2026-03-11', digitos_nit:'5', descripcion:'ICA Anual Socorro (Santander) — NIT termina en 5' },
  // ICA Anual Bogotá — por último dígito NIT (NITs 6-0)
  { tipo_impuesto:'ICA_BIMESTRAL', año:2026, mes:3, dia_vencimiento:13, fecha_vencimiento:'2026-03-13', digitos_nit:'6', descripcion:'ICA Anual Bogotá — NIT termina en 6' },
  { tipo_impuesto:'ICA_BIMESTRAL', año:2026, mes:3, dia_vencimiento:16, fecha_vencimiento:'2026-03-16', digitos_nit:'7', descripcion:'ICA Anual Bogotá — NIT termina en 7' },
  { tipo_impuesto:'ICA_BIMESTRAL', año:2026, mes:3, dia_vencimiento:18, fecha_vencimiento:'2026-03-18', digitos_nit:'8', descripcion:'ICA Anual Bogotá — NIT termina en 8' },
  { tipo_impuesto:'ICA_BIMESTRAL', año:2026, mes:3, dia_vencimiento:20, fecha_vencimiento:'2026-03-20', digitos_nit:'9', descripcion:'ICA Anual Bogotá — NIT termina en 9' },
  { tipo_impuesto:'ICA_BIMESTRAL', año:2026, mes:3, dia_vencimiento:24, fecha_vencimiento:'2026-03-24', digitos_nit:'0', descripcion:'ICA Anual Bogotá — NIT termina en 0' },
  // ── ICA BIMESTRAL Bogotá ───────────────────────────────────────────────────
  { tipo_impuesto:'ICA_BIMESTRAL', año:2026, mes:4, dia_vencimiento:10, fecha_vencimiento:'2026-04-10', descripcion:'ICA Bimestral Bogotá — 1er Bimestre Ene-Feb 2026' },
  { tipo_impuesto:'ICA_BIMESTRAL', año:2026, mes:6, dia_vencimiento:12, fecha_vencimiento:'2026-06-12', descripcion:'ICA Bimestral Bogotá — 2do Bimestre Mar-Abr 2026' },
  { tipo_impuesto:'ICA_BIMESTRAL', año:2026, mes:8, dia_vencimiento:21, fecha_vencimiento:'2026-08-21', descripcion:'ICA Bimestral Bogotá — 3er Bimestre May-Jun 2026' },
  { tipo_impuesto:'ICA_BIMESTRAL', año:2026, mes:10, dia_vencimiento:9, fecha_vencimiento:'2026-10-09', descripcion:'ICA Bimestral Bogotá — 4to Bimestre Jul-Ago 2026' },
  { tipo_impuesto:'ICA_BIMESTRAL', año:2026, mes:12, dia_vencimiento:11, fecha_vencimiento:'2026-12-11', descripcion:'ICA Bimestral Bogotá — 5to Bimestre Sep-Oct 2026' },
  { tipo_impuesto:'ICA_BIMESTRAL', año:2026, mes:2, dia_vencimiento:12, fecha_vencimiento:'2027-02-12', descripcion:'ICA Bimestral Bogotá — 6to Bimestre Nov-Dic 2026' },
  // ── RÉGIMEN SIMPLE DE TRIBUTACIÓN — Declaración Anual Consolidada ──────────
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:4, dia_vencimiento:17, fecha_vencimiento:'2026-04-17', digitos_nit:'1-2', descripcion:'RST — Declaración Anual Consolidada 2025 — NIT termina en 1 o 2' },
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:4, dia_vencimiento:20, fecha_vencimiento:'2026-04-20', digitos_nit:'3-4', descripcion:'RST — Declaración Anual Consolidada 2025 — NIT termina en 3 o 4' },
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:4, dia_vencimiento:21, fecha_vencimiento:'2026-04-21', digitos_nit:'5-6', descripcion:'RST — Declaración Anual Consolidada 2025 — NIT termina en 5 o 6' },
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:4, dia_vencimiento:22, fecha_vencimiento:'2026-04-22', digitos_nit:'7-8', descripcion:'RST — Declaración Anual Consolidada 2025 — NIT termina en 7 o 8' },
  { tipo_impuesto:'RENTA_ANUAL', año:2026, mes:4, dia_vencimiento:23, fecha_vencimiento:'2026-04-23', digitos_nit:'9-0', descripcion:'RST — Declaración Anual Consolidada 2025 — NIT termina en 9 o 0' },
]


export async function POST(): Promise<NextResponse> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'administrador') {
      return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
    }

    // Borrar todos los registros existentes (requiere política RLS DELETE para admin)
    const { error: deleteError } = await supabase
      .from('tax_calendar')
      .delete()
      .gte('año', 2000)

    if (deleteError) throw deleteError

    // Insertar en lotes de 50
    const BATCH = 50
    let inserted = 0
    for (let i = 0; i < CALENDARIO_2026.length; i += BATCH) {
      const batch = CALENDARIO_2026.slice(i, i + BATCH)
      const { error } = await supabase.from('tax_calendar').insert(batch)
      if (error) throw error
      inserted += batch.length
    }

    return NextResponse.json({
      data: {
        inserted,
        message: `Calendario 2026 importado exitosamente: ${inserted} registros del Boletín CALA ASOCIADOS`,
      },
    })
  } catch (error) {
    console.error('[API POST /admin/calendar/seed]', error)
    return NextResponse.json({ error: 'Error al importar el calendario' }, { status: 500 })
  }
}
