// src/lib/perfiles/generarPerfil.ts
// ════════════════════════════════════════════════════════════════════════
// Llama a la IA (Groq por defecto, DeepSeek opcional) para generar o corregir
// un PerfilCliente a partir de la estructura del cliente + instrucciones.
// REGLA DE ORO: la IA SOLO genera el perfil JSON. Nunca toca números.
// Si la IA falla, se devuelve PERFIL_DEFECTO con la instrucción como nota.
//
// IMPORTANTE: las funciones devuelven un OBJETO { perfil, raw, proveedor }
// porque el route.ts lee raw (para debug) y proveedor.
// ════════════════════════════════════════════════════════════════════════

import { createGroqClient, GROQ_MODEL } from '@/lib/groq/client'
import type { EstructuraCliente } from '@/lib/motor-contable/extraerEstructura'
import { estructuraATexto } from '@/lib/motor-contable/extraerEstructura'
import { PERFIL_DEFECTO, type PerfilCliente } from './calcularSimilitud'

export type ProveedorIA = 'groq' | 'deepseek'

// Resultado que esperan las API routes
export interface ResultadoGenerar {
  perfil: PerfilCliente
  raw: string
  proveedor: ProveedorIA
}

// ─────────────────────────────────────────────────────────────────────────
// Validación: garantiza que el objeto tenga TODOS los campos del schema
// ─────────────────────────────────────────────────────────────────────────
function validarYCompletar(parcial: any, notas: string): PerfilCliente {
  const d = PERFIL_DEFECTO
  const p = parcial ?? {}
  return {
    ingresos: {
      mostrarAuxiliares:     Boolean(p.ingresos?.mostrarAuxiliares ?? d.ingresos.mostrarAuxiliares),
      subcuentasConAuxiliar: Array.isArray(p.ingresos?.subcuentasConAuxiliar)
        ? p.ingresos.subcuentasConAuxiliar.map((x: any) => String(x))
        : d.ingresos.subcuentasConAuxiliar,
      nivelDigitosAuxiliar:  Number(p.ingresos?.nivelDigitosAuxiliar ?? d.ingresos.nivelDigitosAuxiliar),
    },
    costos: {
      prefijos: Array.isArray(p.costos?.prefijos) ? p.costos.prefijos.map((x: any) => String(x)) : d.costos.prefijos,
      agruparPorSubcuenta: Boolean(p.costos?.agruparPorSubcuenta ?? d.costos.agruparPorSubcuenta),
    },
    gastos: {
      prefijos: Array.isArray(p.gastos?.prefijos) ? p.gastos.prefijos.map((x: any) => String(x)) : d.gastos.prefijos,
    },
    terceros: {
      excluirDebitoSinCredito: Boolean(p.terceros?.excluirDebitoSinCredito ?? d.terceros.excluirDebitoSinCredito),
      nitExtranjerosPatron:    String(p.terceros?.nitExtranjerosPatron ?? d.terceros.nitExtranjerosPatron),
    },
    columnas: {
      mostrarAcumulado:       Boolean(p.columnas?.mostrarAcumulado ?? d.columnas.mostrarAcumulado),
      mesesAnioActual:        Number(p.columnas?.mesesAnioActual ?? d.columnas.mesesAnioActual),
      mostrarAniosAnteriores: Boolean(p.columnas?.mostrarAniosAnteriores ?? d.columnas.mostrarAniosAnteriores),
    },
    clasificacion: {
      anticipoImpuestosEnCorriente: Boolean(
        p.clasificacion?.anticipoImpuestosEnCorriente ??
        d.clasificacion.anticipoImpuestosEnCorriente
      ),
      aportesNominaEnFiscales: Boolean(
        p.clasificacion?.aportesNominaEnFiscales ??
        d.clasificacion.aportesNominaEnFiscales
      ),
      cxpAgrupaSociosYGastos: Boolean(
        p.clasificacion?.cxpAgrupaSociosYGastos ??
        d.clasificacion.cxpAgrupaSociosYGastos
      ),
    },
    notasEspeciales: String(p.notasEspeciales ?? notas ?? ''),
  }
}

// Extrae el primer objeto JSON de un texto (ignora preámbulo/markdown)
function extraerJSON(texto: string): any {
  const limpio = texto.replace(/```json/gi, '').replace(/```/g, '').trim()
  const start = limpio.indexOf('{')
  const end   = limpio.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) throw new Error('Sin JSON')
  return JSON.parse(limpio.slice(start, end + 1))
}

// ─────────────────────────────────────────────────────────────────────────
// Llamada genérica a la IA (Groq o DeepSeek, ambos formato OpenAI)
// ─────────────────────────────────────────────────────────────────────────
async function llamarIA(
  systemPrompt: string,
  userPrompt: string,
  proveedor: ProveedorIA
): Promise<string> {
  if (proveedor === 'deepseek' && process.env.DEEPSEEK_API_KEY) {
    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 1500,
      }),
    })
    const data = await res.json()
    return data.choices?.[0]?.message?.content ?? '{}'
  }

  // Groq por defecto
  const groq = createGroqClient()
  const completion = await groq.chat.completions.create({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    model: GROQ_MODEL,
    temperature: 0.1,
    max_tokens: 1500,
  })
  return completion.choices[0]?.message?.content ?? '{}'
}

// ─────────────────────────────────────────────────────────────────────────
// Prompt del sistema (describe el schema exacto que debe devolver la IA)
// ─────────────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Eres un asistente experto en contabilidad colombiana (PUC) que configura cómo se debe organizar un estado financiero para un cliente.

Tu UNICA tarea es devolver un objeto JSON de configuracion (un "perfil"). NUNCA calculas numeros ni montos.

El JSON debe tener EXACTAMENTE esta forma:
{
  "ingresos": {
    "mostrarAuxiliares": boolean,
    "subcuentasConAuxiliar": ["418001"],
    "nivelDigitosAuxiliar": 8
  },
  "costos": { "prefijos": ["61","62","71"], "agruparPorSubcuenta": true },
  "gastos": { "prefijos": ["51","52","53"] },
  "terceros": { "excluirDebitoSinCredito": boolean, "nitExtranjerosPatron": "" },
  "columnas": { "mostrarAcumulado": true, "mesesAnioActual": 3, "mostrarAniosAnteriores": true },
  "clasificacion": { "anticipoImpuestosEnCorriente": false, "aportesNominaEnFiscales": false, "cxpAgrupaSociosYGastos": false },
  "notasEspeciales": "resumen breve de las reglas en espanol"
}

REGLAS:
- Si el contador pide "mostrar/discriminar/separar" sub-categorias de una cuenta de ingresos (ej. Servicios -> Hospedaje, Lavanderia), pon mostrarAuxiliares=true y agrega el codigo de esa subcuenta a subcuentasConAuxiliar.
- Si el contador dice que el anticipo de impuestos (cuenta 1355) debe ir en "cuentas por cobrar", "CxC" o "activo corriente", pon clasificacion.anticipoImpuestosEnCorriente = true. Si dice "otros activos" o "no corriente", ponlo en false.
- Si el contador dice que los aportes de nomina (cuenta 2370: EPS, ARL, ICBF, pension) deben ir dentro de "fiscales", pon clasificacion.aportesNominaEnFiscales = true. Si dice que van aparte o en "nomina", ponlo en false.
- Si el contador dice que las "cuentas por pagar" deben agrupar proveedores junto con las deudas con socios o accionistas (cuenta 2355) y los costos y gastos por pagar (cuenta 2335), pon clasificacion.cxpAgrupaSociosYGastos = true. Si dice que van en renglones separados, ponlo en false.
- Usa los codigos reales que aparecen en la estructura del cliente.
- Si no hay instruccion especial, usa los valores por defecto.
- Responde SOLO con el JSON, sin texto antes ni despues, sin markdown.`

// ─────────────────────────────────────────────────────────────────────────
// GENERAR perfil  →  devuelve { perfil, raw, proveedor }
// ─────────────────────────────────────────────────────────────────────────
export async function generarPerfilConIA(
  estructura: EstructuraCliente,
  instrucciones: string,
  proveedor: ProveedorIA = 'groq'
): Promise<ResultadoGenerar> {
  const userPrompt = `ESTRUCTURA DEL CLIENTE:
${estructuraATexto(estructura)}

INSTRUCCIONES DEL CONTADOR:
${instrucciones || '(sin instrucciones especiales, usar configuracion estandar)'}

Devuelve el perfil JSON.`

  let raw = ''
  try {
    raw = await llamarIA(SYSTEM_PROMPT, userPrompt, proveedor)
    const parsed = extraerJSON(raw)
    return { perfil: validarYCompletar(parsed, instrucciones), raw, proveedor }
  } catch (err) {
    console.error('[generarPerfilConIA] IA fallo, usando perfil por defecto:', err)
    return {
      perfil: validarYCompletar(null, instrucciones),
      raw: raw || String(err),
      proveedor,
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// CORREGIR perfil existente  →  devuelve { perfil, raw, proveedor }
// ─────────────────────────────────────────────────────────────────────────
export async function corregirPerfilConIA(
  estructura: EstructuraCliente,
  perfilActual: PerfilCliente,
  correccion: string,
  proveedor: ProveedorIA = 'groq'
): Promise<ResultadoGenerar> {
  const userPrompt = `ESTRUCTURA DEL CLIENTE:
${estructuraATexto(estructura)}

PERFIL ACTUAL (JSON):
${JSON.stringify(perfilActual, null, 2)}

CORRECCION SOLICITADA POR EL CONTADOR:
${correccion}

Devuelve el perfil JSON COMPLETO ya corregido (mismo formato), aplicando solo el cambio pedido.`

  let raw = ''
  try {
    raw = await llamarIA(SYSTEM_PROMPT, userPrompt, proveedor)
    const parsed = extraerJSON(raw)
    const corregido = validarYCompletar(parsed, perfilActual.notasEspeciales)
    corregido.notasEspeciales = [perfilActual.notasEspeciales, correccion]
      .filter(Boolean).join(' | ')
    return { perfil: corregido, raw, proveedor }
  } catch (err) {
    console.error('[corregirPerfilConIA] IA fallo, se mantiene el perfil actual:', err)
    return { perfil: perfilActual, raw: raw || String(err), proveedor }
  }
}