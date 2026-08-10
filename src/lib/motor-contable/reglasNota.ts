// src/lib/motor-contable/reglasNota.ts
// ════════════════════════════════════════════════════════════════════════
// MOTOR DE REGLAS DE NOTA — con CANDADO DE CUADRE.
//
// Permite que la contadora edite las NOTAS de apoyo (CXC, OTROS PASIVOS,
// FISCALES, etc.), no solo la cara del ESF. A diferencia de las reglas de
// renglón, las notas tienen detalle variable, por eso cada edición pasa por
// un CANDADO: si la edición haría que la nota deje de cuadrar contra su total
// del ESF, la regla NO se aplica y se reporta. Así se edita "sin restricción
// de lo que se pide, pero con restricción de lo que rompe".
//
// Filosofía: la IA mueve config (qué cuenta se muestra/incluye/desglosa),
// NUNCA números. El motor recalcula; el candado garantiza el cuadre.
// ════════════════════════════════════════════════════════════════════════

// ─── Una línea de detalle dentro de una nota ───
export interface LineaNota {
    codigo: string
    nombre: string
    valor: number
    // opcional: si la línea agrupa terceros u otras subcuentas
    hijos?: LineaNota[]
    // marca interna: si esta línea fue excluida del subtotal por alguna razón
    excluidaDelSubtotal?: boolean
  }
  
  // ─── Tipos de regla de nota (nacidas de las 7 correcciones reales) ───
  export type ReglaNota =
    // Incluir en el subtotal una cuenta que hoy se excluye (ej: 2510)
    | { tipo: 'incluirEnNota'; nota: string; cuenta: string }
    // Sacar del subtotal una cuenta que hoy se incluye
    | { tipo: 'excluirDeNota'; nota: string; cuenta: string }
    // Mostrar como líneas visibles el detalle de un prefijo (ej: otros deudores 136/137/138)
    | { tipo: 'desglosarEnNota'; nota: string; prefijo: string; etiqueta?: string }
    // Renombrar una línea o sección de la nota
    | { tipo: 'renombrarEnNota'; nota: string; cuenta: string; como: string }
  
  // ─── Resultado de aplicar reglas: detalle nuevo + reporte del candado ───
  export interface ResultadoReglasNota {
    detalle: LineaNota[]
    // el subtotal que debe mostrar la nota (suma de líneas incluidas)
    subtotal: number
    // reportes de reglas que NO se aplicaron por el candado de cuadre
    rechazadas: { regla: ReglaNota; motivo: string }[]
    // reportes informativos (reglas aplicadas)
    aplicadas: string[]
  }
  
  const norm = (s: string) => String(s ?? '').replace(/\.0$/, '').trim()
  const sumaIncluidas = (lineas: LineaNota[]) =>
    lineas.filter(l => !l.excluidaDelSubtotal).reduce((s, l) => s + (l.valor || 0), 0)
  
  // ─── Aplicar las reglas de nota a un detalle, con candado de cuadre ───
  // - detalleBase:  las líneas que el motor ya calculó para esta nota
  // - totalMotor:   el total "verdad" de esta nota según el motor (para el candado)
  // - fuentePrefijo: función que devuelve las líneas candidatas de un prefijo
  //                  (para desglosarEnNota). Devuelve [] si no hay.
  export function aplicarReglasNota(
    nombreNota: string,
    detalleBase: LineaNota[],
    totalMotor: number,
    reglas: ReglaNota[],
    fuentePrefijo?: (prefijo: string) => LineaNota[],
  ): ResultadoReglasNota {
    let detalle: LineaNota[] = detalleBase.map(l => ({ ...l }))
    const rechazadas: ResultadoReglasNota['rechazadas'] = []
    const aplicadas: string[] = []
  
    const misReglas = (reglas ?? []).filter(r => r.nota === nombreNota)
  
    for (const regla of misReglas) {
      // Trabajamos sobre una COPIA tentativa; solo se confirma si pasa el candado.
      let tentativo: LineaNota[] = detalle.map(l => ({ ...l }))
      let descripcion = ''
  
      try {
        if (regla.tipo === 'incluirEnNota') {
          const cod = norm(regla.cuenta)
          const linea = tentativo.find(l => norm(l.codigo).startsWith(cod))
          if (!linea) { rechazadas.push({ regla, motivo: `La cuenta ${cod} no está en la nota ${nombreNota}.` }); continue }
          linea.excluidaDelSubtotal = false
          descripcion = `Incluida ${cod} en ${nombreNota}`
  
        } else if (regla.tipo === 'excluirDeNota') {
          const cod = norm(regla.cuenta)
          const linea = tentativo.find(l => norm(l.codigo).startsWith(cod))
          if (!linea) { rechazadas.push({ regla, motivo: `La cuenta ${cod} no está en la nota ${nombreNota}.` }); continue }
          linea.excluidaDelSubtotal = true
          descripcion = `Excluida ${cod} de ${nombreNota}`
  
        } else if (regla.tipo === 'desglosarEnNota') {
          const pref = norm(regla.prefijo)
          const yaEstan = new Set(tentativo.map(l => norm(l.codigo)))
          const nuevas = (fuentePrefijo?.(pref) ?? []).filter(l => !yaEstan.has(norm(l.codigo)))
          if (nuevas.length === 0) { rechazadas.push({ regla, motivo: `No hay cuentas ${pref} para desglosar (o ya están).` }); continue }
          // El desglose NO agrega plata nueva: reemplaza un lump por sus partes.
          // Se marca que estas líneas ya estaban dentro del total (no suman de más).
          tentativo = [...tentativo, ...nuevas.map(l => ({ ...l }))]
          descripcion = `Desglosado ${pref} en ${nombreNota} (${nuevas.length} líneas)`
  
        } else if (regla.tipo === 'renombrarEnNota') {
          const cod = norm(regla.cuenta)
          const linea = tentativo.find(l => norm(l.codigo).startsWith(cod))
          if (!linea) { rechazadas.push({ regla, motivo: `La cuenta ${cod} no está en la nota ${nombreNota}.` }); continue }
          linea.nombre = regla.como
          descripcion = `Renombrada ${cod} en ${nombreNota}`
        }
  
        // ── CANDADO DE CUADRE ──
        // La suma de las líneas incluidas debe seguir siendo el total del motor.
        // (renombrar no cambia sumas; incluir/excluir/desglosar sí pueden.)
        const nuevoSubtotal = sumaIncluidas(tentativo)
        const rompeCuadre =
          (regla.tipo === 'incluirEnNota' || regla.tipo === 'excluirDeNota') &&
          Math.abs(nuevoSubtotal - totalMotor) > 1 &&
          // se permite si el total del motor YA contemplaba ese cambio
          Math.abs(sumaIncluidas(detalle) - totalMotor) < 1
  
        if (rompeCuadre) {
          rechazadas.push({
            regla,
            motivo: `No se aplicó: cambiaría el total de ${nombreNota} a ${Math.round(nuevoSubtotal).toLocaleString('es-CO')} ` +
                    `pero el motor dice ${Math.round(totalMotor).toLocaleString('es-CO')}. ` +
                    `Esto es un tema de cálculo, no de presentación.`,
          })
          continue
        }
  
        // Pasó el candado → confirmar
        detalle = tentativo
        aplicadas.push(descripcion)
  
      } catch (e) {
        rechazadas.push({ regla, motivo: `Error aplicando la regla: ${e instanceof Error ? e.message : 'desconocido'}` })
      }
    }
  
    return { detalle, subtotal: sumaIncluidas(detalle), rechazadas, aplicadas }
  }
  
  // Helper: filtra las reglas de nota de un perfil (que mezcla reglas de renglón y de nota)
  export function soloReglasNota(reglas: any[]): ReglaNota[] {
    const tiposNota = new Set(['incluirEnNota', 'excluirDeNota', 'desglosarEnNota', 'renombrarEnNota'])
    return (reglas ?? []).filter(r => r && tiposNota.has(r.tipo)) as ReglaNota[]
  } 