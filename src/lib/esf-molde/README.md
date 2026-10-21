# ESF por molde — instalación y prueba

El sistema **no decide** la estructura del ESF: copia la de la contadora. Ella sube su
ESF histórico una vez (Fase A, *aprender*) y cada mes solo sube el balance
(Fase B, *extender*): se inserta la columna del mes nuevo en todas las hojas,
se clonan fórmulas y diseño, se escriben los valores del balance y se marca
para revisión lo que es criterio de ella.

## Archivos nuevos / cambiados

| Archivo | Qué es |
|---|---|
| `src/lib/esf-molde/molde.py` | Motor (Python + openpyxl). `aprender` y `extender`. |
| `src/lib/esf-molde/balanceAJson.ts` | Puente: `parser.ts` (Siigo/WO/SIESA/SYD) → JSON para Python. |
| `src/app/api/esf-molde/route.ts` | API: aprender, extender, listar, descargar, borrar. |
| `src/app/(dashboard)/esf-molde/page.tsx` | Página del panel. |
| `src/components/esf-molde/EsfMoldePanel.tsx` | UI: empresas, nueva empresa, agregar mes, reportes. |
| `src/components/layout/Sidebar.tsx` | Entrada "ESF por molde" en el menú (cambio pequeño). |
| `supabase/migrations/20261021_esf_moldes.sql` | Tabla `esf_moldes` + bucket `esf-moldes`. |

No se tocó nada del motor viejo (`motor-contable`): conviven hasta que este quede probado.

## Pasos para desplegar

1. **Copiar los archivos** al repo (mismas rutas) y hacer commit/push a `main`.
2. **Supabase → SQL Editor**: pegar y ejecutar `supabase/migrations/20261021_esf_moldes.sql`.
   Crea la tabla y el bucket privado `esf-moldes` (los Excel pesan varios MB; no van en la tabla).
3. **Railway → Variables**: confirmar que exista `SUPABASE_SERVICE_ROLE_KEY` (ya la usan las rutas
   de admin). El API usa ese cliente para el bucket. `nixpacks.toml` ya instala `openpyxl`; no hay
   que cambiar nada del build.
4. Deploy. Entrar a **ESF por molde** en el menú.

## Cómo probar (con TURISMO)

1. *Nueva empresa* → subir `ESF_ABRIL_2026_-_TURISMO.xlsx` + `Balance_de_prueba_por_tercero_-_ABRIL_2026_TURISMO.xlsx`.
   Tarda ~30 s. Debe mostrar ≈109 celdas "del balance", ≈238 fórmulas, 4 manuales
   (Cabaña, Personal Hotel, Personal Cabaña, Wilber 4532) y 3 dudosos.
2. Entrar a la empresa → *Agregar mes* → subir el balance de **mayo 2026**.
   Descargar y abrir en Excel: la columna MAY queda a la izquierda de ABR en ESF, NOTAS ESF,
   NOTAS ER, ERI y las hojas de detalle; "ACUMULADO A ABR" pasa a "ACUMULADO A MAY".
3. Comparar contra el ESF de mayo que hizo la contadora. Las diferencias deberían estar solo
   en las celdas listadas en "Para revisar".

## Reglas que aplica el motor (resumen)

- Solo se extienden las hojas que van en el **mes más reciente** del libro. Hojas viejas
  (INGRESOS 2020, COMPARATIVO 2023, PROVE, etc.) no se tocan.
- Cada celda de la columna del mes se clasifica al aprender:
  `BALANCE` (cruza con cuenta / suma de cuentas / tercero por NIT / cuenta-menos-terceros),
  `FORMULA`/`CADENA` (se clona corrida), `CONSTANTE` (igual en meses anteriores),
  `MANUAL` (no cruza: se arrastra y se marca).
- Fórmulas con un número del balance adentro (`=28614668+200000-4276000`) → se actualiza el
  número y se conserva el ajuste, marcado para revisar.
- Terceros nuevos → fila nueva dentro del bloque (en orden alfabético), solo en bloques puros
  de terceros. Se emparejan por NIT, no por nombre.
- Rangos acumulados (`=SUM(C8:F8)`) se expanden para incluir el mes nuevo.
- Las fórmulas se reescriben con el tokenizador de openpyxl, incluidas referencias cruzadas
  entre hojas. Referencias a libros externos (`[12]...`) no se tocan.

## Limitaciones conocidas (v1)

- **Gráficos e imágenes se pierden** (openpyxl no los conserva). En TURISMO están en
  COMPARATIVO y Hoja1, que no afectan el ESF. Si importan, hay que reinyectarlos desde el zip.
- Cambio de año (ENE): inserta columna separadora + nueva con el año; probado solo en lógica,
  no con un archivo real de enero.
- Orden "mes reciente a la derecha": soportado en código, no probado con archivo real.
- El motor no recalcula fórmulas; Excel lo hace al abrir. El cuadre se ve al abrir el archivo.

## Probar el motor a mano (sin la app)

```bash
# balance → json (usa el parser existente)
npx tsx -e "import {readFileSync,writeFileSync} from 'fs';import {parsearBalanceAJson} from './src/lib/esf-molde/balanceAJson';writeFileSync('bal.json',JSON.stringify(parsearBalanceAJson(readFileSync('BALANCE.xlsx'),'BALANCE.xlsx')))"
python3 src/lib/esf-molde/molde.py aprender ESF.xlsx bal.json molde.json
python3 src/lib/esf-molde/molde.py extender ESF.xlsx molde.json bal_mes_nuevo.json ESF_nuevo.xlsx
```