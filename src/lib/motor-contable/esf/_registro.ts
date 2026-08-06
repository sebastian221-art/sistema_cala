// src/lib/motor-contable/esf/_registro.ts
// ─────────────────────────────────────────────────────────────
// REGISTRO DE CELDAS — el corazón del Nivel B.
//
// Problema que resuelve: en el Nivel B, la hoja ESF no lleva números sino
// fórmulas que apuntan a los totales de las notas (CAJA, BANCOS, CXC…). Pero
// esas notas tienen filas dinámicas (varían según cuántos terceros haya), así
// que la celda del total NO está en una fila fija.
//
// Solución: mientras cada nota se genera, "publica" en qué celda quedó su
// total. Luego el ESF (u otra hoja) pide esa referencia y arma la fórmula.
// Así el ESF nunca queda pegado a una fila fija y no se rompe.
//
// Uso:
//   // dentro de hojaCAJA, cuando ya sabe en qué fila quedó su total:
//   reg.publicar('efectivo.caja', 'CAJA', `G${filaTotal}`)
//
//   // dentro de hojaESF, al armar el renglón de Efectivo:
//   celda.value = { formula: reg.suma('efectivo.caja', 'efectivo.bancos') }
//   //  ->  = 'CAJA'!G20 + 'BANCOS'!G31
// ─────────────────────────────────────────────────────────────

export class RegistroCeldas {
    private mapa = new Map<string, string>()
  
    /** Una hoja publica dónde quedó el total de un concepto (por período si aplica). */
    publicar(clave: string, hoja: string, celda: string): void {
      // El nombre de hoja se envuelve en comillas simples por si tiene espacios
      // (ej. 'OTROS PASIVOS'). Excel lo exige.
      this.mapa.set(clave, `'${hoja}'!${celda}`)
    }
  
    /** Devuelve la referencia cruda de un concepto, o null si no se publicó. */
    ref(clave: string): string | null {
      return this.mapa.get(clave) ?? null
    }
  
    /**
     * Arma una fórmula que suma varias referencias, ignorando las que falten.
     * Devuelve el texto SIN el '=' inicial (ExcelJS lo agrega vía { formula }).
     * Si ninguna referencia existe, devuelve null (el ESF pondría 0 en ese caso).
     */
    sumaFormula(...claves: string[]): string | null {
      const refs = claves.map(k => this.mapa.get(k)).filter((x): x is string => !!x)
      return refs.length ? refs.join('+') : null
    }
  
    tiene(clave: string): boolean {
      return this.mapa.has(clave)
    }
  
    /** Solo para depurar: ver todo lo publicado. */
    volcar(): Record<string, string> {
      return Object.fromEntries(this.mapa)
    }
  }