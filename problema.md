# Resumen — Módulo Consolidación de IVA (CALA) y análisis de la conexión con la DIAN

> Documento de referencia. Recoge lo importante de todo lo que analizamos: el
> objetivo, el módulo que se construyó, las dos formas de conseguir los XML, por
> qué la automatización (Opción B) no resolvió el problema, y el error del portal.

---

## 1. El objetivo

Replicar lo que hace **Kontalid** para la consolidación de IVA: leer las facturas
de un cliente y generar un Excel con las bases y el IVA **discriminado por tarifa
(19% / 5% / exento)**, separando ventas, compras, nómina y documento soporte, y
calculando el IVA a pagar del periodo.

---

## 2. La pieza clave: listado vs XML

Todo el problema gira alrededor de **de dónde salen los datos**. Hay dos insumos y
son muy distintos:

| Insumo | Qué trae | Sirve para IVA 19%/5%? |
|---|---|---|
| **Listado DIAN** (el "token dian", `Rp_Doc_*`) | Un solo **IVA agregado** por documento + total | **No.** Con un solo número es imposible separar tarifas |
| **XML** (AttachedDocument, UBL 2.1) | El **desglose real**: base y valor de cada tarifa | **Sí.** Es lo único que permite el cálculo perfecto |

**Conclusión de fondo:** el archivo queda "perfecto" **solo con el XML**. El
listado siempre obliga a asumir 19%. Esto no es un problema de programación, es un
límite de los datos: del listado no se puede sacar lo que no está.

---

## 3. El módulo que se construyó (núcleo estable)

Se creó el módulo **Consolidación de IVA**, con el mismo patrón del Formulario 1647
(Python calcula, Next.js solo recibe y devuelve el archivo).

**Archivos y ubicación:**

```
src/lib/consolidacion-iva/leer_xml.py          -> lee/desempaca XML, discrimina IVA por tarifa
src/lib/consolidacion-iva/consolidar_iva.py    -> motor: cruza listado + XML y genera el Excel
src/app/api/consolidacion-iva/route.ts         -> endpoint POST
src/app/(dashboard)/consolidacion-iva/page.tsx -> página (drag-and-drop, estados, tarjetas)
src/components/layout/Sidebar                   -> se agregó el ítem al menú
```

**Qué hace el motor:**

- Clasifica cada documento por Grupo (Emitido/Recibido) y tipo → hojas VENTAS,
  COMPRAS, NÓMINA, DOCUMENTO SOPORTE.
- **Excluye los "Application response"** (son eventos, no facturas).
- Registra las **notas crédito en negativo**.
- **Con XML** → bases reales 19%/5%/exento (`Origen = XML`).
- **Sin XML** → asume 19% (`Base = IVA/19%`, `Origen = Asumido 19%`).
- Columna **Diferencia** = Total DIAN − Total calculado (chequeo de auditoría; con
  XML es real, sin XML da 0 por construcción).
- Hoja **ACUMULADO** con ventas vs compras e IVA a pagar.

**Validación real:** probado contra el token de PIVOTE (60 filas; 14 excluidas por
ser Application response). Cuadró: IVA ventas 14.236.700 − IVA compras 8.431.940 =
**IVA a pagar 5.804.760**, con 203 fórmulas y cero errores.

**Estado:** el núcleo está **completo y funcionando**. Recibe `listado + ZIP de XML`
y produce el archivo. Funciona sin importar de dónde vengan los XML.

---

## 4. Las dos formas de conseguir los XML

- **Opción A (estable):** la contadora descarga/exporta los XML desde el portal y
  **los sube a CALA**. Sin credenciales, sin fragilidad.
- **Opción B (frágil):** CALA descarga los XML **sola**, autenticándose contra la
  DIAN. Es lo que se intentó automatizar… y es lo que **no funcionó**.

---

## 5. Por qué la Opción B (automatización) NO resolvió todo

Se investigó a fondo y aparecieron **tres muros**, cualquiera de ellos suficiente
para descartarla:

### 5.1. El endpoint capturado no baja XML, y el export era el listado
La petición capturada fue:
```
GET catalogo-vpfe.dian.gov.co/Document/DownloadExportedZipFile?pk={NIT}&rk={exportKey}
```
- No descarga un XML por CUFE: descarga un **export ya generado** (un ZIP).
- Responde **302** y redirige a un **blob de Azure** con URL firmada que **expira en
  ~10 segundos** (hay que seguir el redirect al instante).
- Y lo decisivo: **el ZIP contenía el LISTADO** (`Rp_Doc`, las mismas 32 columnas,
  IVA agregado), **no los XML**. O sea, ni siquiera resolvía el 5%/19%.

### 5.2. El muro anti-bot atado a la IP
La autenticación **no es un token bearer**, son **cookies de sesión**:
`.AspNet.ApplicationCookie` (login), `__RequestVerificationToken` (anti-CSRF),
`ASP.NET_SessionId`, y sobre todo `afd_azwaf_jsclearance` — un **clearance anti-bot
de Azure Front Door**, válido ~30 min y **atado a la IP** que pasó un reto de
JavaScript. Corriendo desde el servidor de CALA (otra IP), la DIAN vuelve a retar y
**bloquea**. Un `requests` de Python no pasa ese reto. Es el mismo muro que hizo que
Kontalid abandonara la descarga "sin token".

### 5.3. El login manda el token al correo del CLIENTE (el muro definitivo)
El punto que cerró el tema: para entrar, la contadora pone las claves del cliente y
pide "generar token"; **la DIAN envía ese token al correo del CLIENTE**, el cliente
lo **reenvía**, y con eso la contadora ingresa. Es un paso **manual y humano por
diseño** de la DIAN, para que un tercero no entre sin que el dueño se entere.
**Ningún servidor puede automatizar eso** — el token no llega a CALA. Por eso ni
Kontalid lo automatiza: cuando pide "un token de 60 minutos", da por hecho que el
humano **ya hizo** ese login del correo.

**Resumen de la Opción B:** imposible de automatizar de forma seria. No es falta de
código; es cómo está diseñada la seguridad de la DIAN.

---

## 6. El error "Page not found" (Azure Front Door)

Al entrar al portal salió una pantalla azul: *"We weren't able to find your Azure
Front Door Service configuration"*.

- **Por qué pasa:** es un error **del lado de la DIAN**, no del computador ni del
  usuario. El portal corre sobre Azure Front Door y ese mensaje aparece cuando su
  servicio está caído o mal configurado temporalmente.
- **Qué hacer:** reintentar, entrar directo por `catalogo-vpfe.dian.gov.co/User/Login`
  y esperar unos minutos.
- **Lo que enseña:** el portal es **inestable**. Sumado al login por correo, es otra
  razón de peso para no montar un producto encima de la automatización de la DIAN.

---

## 7. Conclusión y decisión

La **Opción A es la única compatible** con la seguridad de la DIAN — no es un premio
de consolación, es el camino correcto. El flujo final:

1. La contadora hace su login de siempre (con el token que el cliente le reenvía).
   Ese paso es inevitable, con CALA o sin CALA, y **ya es su rutina normal**.
2. Ya dentro del portal, **exporta los documentos**.
3. **Sube los archivos a CALA** → el motor genera el consolidado.

**CALA nunca toca las claves ni el token del cliente.** Ese login ocurre completo en
el navegador de la contadora, fuera de CALA. Eso es lo más sano legal y
técnicamente.

---

## 8. Lo único que queda pendiente

Confirmar, cuando el portal vuelva a estar disponible, **si Recibidos exporta los
XML en bloque** (no solo el Excel del listado):

- **Si exporta XML** → la contadora sube ese ZIP + el listado, y el archivo queda
  **perfecto** con el módulo actual. **Todo resuelto, sin nada frágil.**
- **Si solo da PDF/Excel** → seguimos asumiendo 19%, y habría que ver si el XML se
  baja de a uno (con fricción).

---

## 9. Aprendizajes clave

- **El "perfecto" lo da el XML, no la automatización.** Quien descarga el XML no
  cambia la calidad del resultado; solo cambia la comodidad.
- **Del listado no se puede sacar el 5% vs 19%.** Es límite de datos, no de código.
- **La DIAN no se debe automatizar desde el servidor:** anti-bot por IP + login por
  correo al cliente + portal inestable. Kontalid tampoco lo hace realmente.
- **No manejar credenciales de clientes** es una decisión de diseño correcta, no una
  limitación.
- **Arquitectura en capas:** el núcleo (lector XML + motor) es estable y ya está
  listo; cualquier forma de conseguir los XML se le conecta por encima sin tocarlo.