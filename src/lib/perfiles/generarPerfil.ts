// src/lib/perfiles/generarPerfil.ts
// ════════════════════════════════════════════════════════════════════════
// La IA (Groq / DeepSeek) genera o corrige el PerfilCliente.
//
// REGLA DE ORO: la IA SOLO escribe configuración (JSON). Nunca toca números.
//
// TANDA 8: la IA ahora escribe REGLAS LIBRES. Ya no está limitada a 3
// booleanos — puede mover, agrupar, separar o renombrar cualquier cuenta.
// ════════════════════════════════════════════════════════════════════════

import { createGroqClient, GROQ_MODEL } from '@/lib/groq/client'
import type { EstructuraCliente } from '@/lib/motor-contable/extraerEstructura'
import { estructuraATexto } from '@/lib/motor-contable/extraerEstructura'
import { PERFIL_DEFECTO, type PerfilCliente } from './calcularSimilitud'
import { RENGLONES, type Regla, type RenglonId } from '@/lib/motor-contable/reglas'

export type ProveedorIA = 'groq' | 'deepseek'

export interface ResultadoGenerar {
  perfil: PerfilCliente
  raw: string
  proveedor: ProveedorIA
}

// ─────────────────────────────────────────────────────────────────────────
// VALIDACIÓN DE REGLAS
// Una regla mal formada se descarta en silencio: nunca debe tumbar el ESF.
// ─────────────────────────────────────────────────────────────────────────
const TIPOS_VALIDOS = ['mover', 'agrupar', 'separar', 'renombrar']

function esRenglonValido(x: unknown): x is RenglonId {
  return typeof x === 'string' && (RENGLONES as readonly string[]).includes(x)
}

function validarReglas(raw: unknown): Regla[] {
  if (!Array.isArray(raw)) return []
  const out: Regla[] = []

  for (const r of raw) {
    if (!r || typeof r !== 'object') continue
    const tipo = String((r as any).tipo ?? '')
    if (!TIPOS_VALIDOS.includes(tipo)) continue

    const cuenta   = (r as any).cuenta
    const cuentas  = (r as any).cuentas
    const destino  = (r as any).a
    const renglon  = (r as any).renglon
    const como     = (r as any).como

    if (tipo === 'mover') {
      if (typeof cuenta !== 'string' || !/^\d{2,8}$/.test(cuenta)) continue
      if (!esRenglonValido(destino)) continue
      out.push({ tipo: 'mover', cuenta, a: destino })
    }

    else if (tipo === 'agrupar') {
      if (!Array.isArray(cuentas) || cuentas.length === 0) continue
      if (!esRenglonValido(destino)) continue
      const ctas = cuentas
        .map((x: unknown) => String(x))
        .filter((x: string) => /^\d{2,8}$/.test(x))
      if (ctas.length === 0) continue
      out.push({ tipo: 'agrupar', cuentas: ctas, a: destino })
    }

    else if (tipo === 'separar') {
      if (typeof cuenta !== 'string' || !/^\d{2,8}$/.test(cuenta)) continue
      if (!esRenglonValido(destino)) continue
      out.push({
        tipo: 'separar',
        cuenta,
        a: destino,
        como: typeof como === 'string' ? como : undefined,
      })
    }

    else if (tipo === 'renombrar') {
      if (!esRenglonValido(renglon)) continue
      if (typeof como !== 'string' || !como.trim()) continue
      out.push({ tipo: 'renombrar', renglon, como: como.trim() })
    }
  }

  return out
}

// ─────────────────────────────────────────────────────────────────────────
// VALIDACIÓN DEL PERFIL COMPLETO
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
      prefijos: Array.isArray(p.costos?.prefijos)
        ? p.costos.prefijos.map((x: any) => String(x))
        : d.costos.prefijos,
      agruparPorSubcuenta: Boolean(p.costos?.agruparPorSubcuenta ?? d.costos.agruparPorSubcuenta),
    },
    gastos: {
      prefijos: Array.isArray(p.gastos?.prefijos)
        ? p.gastos.prefijos.map((x: any) => String(x))
        : d.gastos.prefijos,
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
        p.clasificacion?.anticipoImpuestosEnCorriente ?? d.clasificacion.anticipoImpuestosEnCorriente
      ),
      aportesNominaEnFiscales: Boolean(
        p.clasificacion?.aportesNominaEnFiscales ?? d.clasificacion.aportesNominaEnFiscales
      ),
      cxpAgrupaSociosYGastos: Boolean(
        p.clasificacion?.cxpAgrupaSociosYGastos ?? d.clasificacion.cxpAgrupaSociosYGastos
      ),
    },
    reglas: validarReglas(p.reglas),
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
// Llamada a la IA (Groq o DeepSeek, ambos formato OpenAI)
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
        max_tokens: 2000,
      }),
    })
    const data = await res.json()
    return data.choices?.[0]?.message?.content ?? '{}'
  }

  const groq = createGroqClient()
  const completion = await groq.chat.completions.create({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    model: GROQ_MODEL,
    temperature: 0.1,
    max_tokens: 2000,
  })
  return completion.choices[0]?.message?.content ?? '{}'
}

// ─────────────────────────────────────────────────────────────────────────
// PROMPT DEL SISTEMA
// Aquí es donde la IA aprende a escribir reglas.
// ─────────────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Eres un contador publico colombiano experto en el PUC. Configuras COMO se presenta un Estado de Situacion Financiera (ESF) traduciendo lo que pide otro contador a reglas de configuracion.

Tu tarea es devolver UN objeto JSON (un "perfil"). NUNCA calculas ni escribes montos: solo dices DONDE va cada cuenta y COMO se muestra. Los numeros los pone el motor; tu mueves la configuracion. Asi nunca se descuadra.

═══ RENGLONES DISPONIBLES (usa SOLO estos nombres) ═══
Activo corriente:  efectivo, inversiones, cuentasPorCobrar, inventarios, otrosActivosCorrientes
Activo no corriente:  ppye, otrosActivosNoCorrientes
Pasivo corriente:  financierosCorriente, proveedores, costosGastosPagar, fiscales, beneficiosEmpleados, otrosPasivosCorriente
Pasivo no corriente:  financierosNoCorriente, beneficiosNoCorriente, otrosPasivosNoCorriente

═══ TIPOS DE REGLA Y SU PODER REAL ═══
1. mover — una cuenta (o TODO un grupo/clase por prefijo) cambia de renglon.
   El codigo puede ser exacto ("235505") o un PREFIJO que arrastra todo lo que empiece asi.
   { "tipo":"mover", "cuenta":"1355", "a":"cuentasPorCobrar" }
   { "tipo":"mover", "cuenta":"26",   "a":"otrosPasivosNoCorriente" }   ← mueve TODA la clase 26
   { "tipo":"mover", "cuenta":"2370", "a":"fiscales" }                   ← mueve TODOS los aportes de nomina

2. agrupar — varias cuentas se juntan en un renglon.
   { "tipo":"agrupar", "cuentas":["2205","2355","2335"], "a":"proveedores" }

3. separar — una cuenta se muestra como sub-linea visible (el monto sigue en el renglon).
   { "tipo":"separar", "cuenta":"2805", "a":"otrosPasivosCorriente", "como":"Anticipos de clientes" }

4. renombrar — cambia la etiqueta de un renglon (NO mueve plata, solo el titulo).
   { "tipo":"renombrar", "renglon":"beneficiosNoCorriente", "como":"Pasivos Estimados y Provisiones" }

COMBINA reglas para lograr peticiones complejas. Ejemplo: "las provisiones (clase 26) van aparte y se llaman Pasivos Estimados"
   -> [ { "tipo":"mover","cuenta":"26","a":"otrosPasivosNoCorriente" },
        { "tipo":"renombrar","renglon":"otrosPasivosNoCorriente","como":"Pasivos Estimados y Provisiones" } ]

═══ EJEMPLOS REALES (peticiones de contadora → reglas) ═══
- "el anticipo de impuestos (1355) va en cuentas por cobrar"
  -> { "tipo":"mover", "cuenta":"1355", "a":"cuentasPorCobrar" }
- "los aportes de nomina (EPS, ARL, ICBF, pension) van en fiscales"
  -> { "tipo":"mover", "cuenta":"2370", "a":"fiscales" }
- "pasa las provisiones X tercero (clase 26) a su propio renglon de provisiones"
  -> [ { "tipo":"mover","cuenta":"26","a":"otrosPasivosNoCorriente" },
       { "tipo":"renombrar","renglon":"otrosPasivosNoCorriente","como":"Pasivos Estimados y Provisiones" } ]
- "las cuentas por pagar agrupan proveedores, socios y costos y gastos"
  -> { "tipo":"agrupar", "cuentas":["2205","2355","2335"], "a":"proveedores" }
- "muestra los anticipos de clientes como linea aparte"
  -> { "tipo":"separar", "cuenta":"2805", "a":"otrosPasivosCorriente", "como":"Anticipos de clientes" }
- "llama a fiscales 'Impuestos por pagar'"
  -> { "tipo":"renombrar", "renglon":"fiscales", "como":"Impuestos por pagar" }
- "junta las obligaciones financieras corto y largo plazo"
  -> { "tipo":"mover", "cuenta":"21", "a":"financierosNoCorriente" }

═══ COMO DECIDIR (esto es lo mas importante) ═══
Antes de rendirte, SIEMPRE intenta expresar la peticion como una o varias reglas de arriba.
La gran mayoria de las peticiones de un contador son de PRESENTACION (donde va o como se llama algo) y SI se pueden hacer con reglas.

Solo hay 3 casos donde NO usas una regla, y en cada uno respondes distinto y con PRECISION:
  (a) La cuenta que menciona NO aparece en la estructura del cliente.
      -> reglas:[] y en notasEspeciales di EXACTAMENTE: "La cuenta X no esta en el balance cargado; verificar que exista en el periodo."
  (b) Pide un detalle DENTRO de una nota de apoyo (ej. desglosar terceros de una cuenta en la nota, o incluir/excluir una linea en una nota).
      -> reglas:[] y en notasEspeciales di: "Esto es un ajuste de la nota de apoyo [nombre], no del renglon del ESF; requiere ajuste del generador de esa nota."
  (c) Reporta que un MONTO esta mal (un total no cuadra o un valor no coincide).
      -> reglas:[] y en notasEspeciales di: "Posible tema de calculo del motor, no de presentacion; revisar como se agrega la cuenta X."
NUNCA respondas el generico "eso viene del balance, revisar". Siempre di CUAL de los 3 casos es y CUAL cuenta.

═══ FORMATO EXACTO DE RESPUESTA ═══
{
  "ingresos": { "mostrarAuxiliares": false, "subcuentasConAuxiliar": [], "nivelDigitosAuxiliar": 8 },
  "costos": { "prefijos": ["61","62","7"], "agruparPorSubcuenta": true },
  "gastos": { "prefijos": ["51","52","53"] },
  "terceros": { "excluirDebitoSinCredito": false, "nitExtranjerosPatron": "" },
  "columnas": { "mostrarAcumulado": true, "mesesAnioActual": 3, "mostrarAniosAnteriores": true },
  "clasificacion": { "anticipoImpuestosEnCorriente": false, "aportesNominaEnFiscales": false, "cxpAgrupaSociosYGastos": false },
  "reglas": [],
  "notasEspeciales": "resumen breve en espanol de lo que pidio el contador y que reglas aplicaste (o por que no)"
}

═══ REGLAS DE ORO ═══
- Usa SOLO los nombres de renglon de la lista. Cualquier otro se descarta.
- Usa los codigos PUC reales que aparecen en la estructura del cliente.
- 'mover' con prefijo corto (1-2 digitos) arrastra TODO ese grupo: uselo para clases enteras.
- Si el contador no pide nada especial, deja "reglas": [].
- Deja "clasificacion" siempre en false: usa "reglas" para todo.
- Para costos, el prefijo "7" incluye toda la clase 7 (materia prima 71 + mano de obra 72 + indirectos 73).
- Responde SOLO con el JSON. Sin texto antes ni despues. Sin markdown.`

// ─────────────────────────────────────────────────────────────────────────
// GENERAR perfil
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
// CORREGIR perfil existente
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

Devuelve el perfil JSON COMPLETO ya corregido.
CONSERVA las reglas que ya estaban y AGREGA o AJUSTA solo lo que pidio ahora.`

  let raw = ''
  try {
    raw = await llamarIA(SYSTEM_PROMPT, userPrompt, proveedor)
    const parsed = extraerJSON(raw)
    const corregido = validarYCompletar(parsed, perfilActual.notasEspeciales)
    corregido.notasEspeciales = [perfilActual.notasEspeciales, correccion]
      .filter(Boolean)
      .join(' | ')
    return { perfil: corregido, raw, proveedor }
  } catch (err) {
    console.error('[corregirPerfilConIA] IA fallo, se mantiene el perfil actual:', err)
    return { perfil: perfilActual, raw: raw || String(err), proveedor }
  }
}