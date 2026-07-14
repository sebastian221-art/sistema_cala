// Módulo de parseo de RUT colombiano (PDF e imagen)
// Extrae datos del contribuyente usando OCR + IA (Groq)

import { ExtractedRutData } from '@/types'
import Groq from 'groq-sdk'


// Extraer texto de PDF usando pdf-parse
export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  const { extractText } = await import('unpdf')
  
  const { text } = await extractText(new Uint8Array(buffer))
  return text.join('\n').trim()
}

// Extraer texto de imagen usando Tesseract.js (OCR)
export async function extractTextFromImage(buffer: Buffer): Promise<string> {
  // Tesseract.js funciona en browser y Node.js
  const Tesseract = await import('tesseract.js')
  const worker = await Tesseract.createWorker('spa') // Español
  const {
    data: { text },
  } = await worker.recognize(buffer)
  await worker.terminate()
  return text
}

// Parsear datos del RUT usando Groq IA
export async function parseRUTWithAI(rawText: string): Promise<ExtractedRutData> {
  const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
  })

  // Sanitizar el texto antes de enviar a la IA (mantener + para teléfonos internacionales)
  const sanitizedText = rawText
    .replace(/[^\w\s.,;:¡!¿?áéíóúÁÉÍÓÚñÑ\-()\/+#@]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000)

  const prompt = `Eres un experto en lectura de documentos RUT (Registro Único Tributario) colombianos de la DIAN. Analiza el siguiente texto extraído del RUT y extrae los campos exactos.

TEXTO DEL RUT:
${sanitizedText}

INSTRUCCIONES CRÍTICAS — LEE CON ATENCIÓN:

1. **NIT (Campo 5)**:
   - Busca específicamente "5. Número de Identificación Tributaria (NIT)" o "NIT" seguido de un número.
   - El NIT tiene formato: XXXXXXXXX-Y (entre 9-10 dígitos seguidos de guión y dígito verificador), ejemplo: 900123456-7
   - NUNCA uses el "Número de formulario" (campo en la parte superior del documento, tiene 15+ dígitos como "4127533789125"). Ese número NO es el NIT.
   - Si ves un número de 15+ dígitos al inicio del documento, es el formulario, IGNÓRALO para el NIT.
   - Para personas naturales, el NIT puede ser el número de cédula con dígito verificador.

2. **Razón Social / Nombre (Campo 35 o 31)**:
   - Busca "Razón social", "Nombre", "Primer apellido", "Segundo apellido" y el nombre completo.

3. **Tipo de contribuyente**:
   - "persona_juridica" si es empresa/sociedad
   - "persona_natural" si es persona natural/individuo

4. **Teléfono (Campo 44 - Teléfono 1)**:
   - Busca específicamente "44" o "Teléfono 1" seguido del número.
   - Incluye el número completo tal como aparece (con indicativo de ciudad si lo tiene).
   - Ejemplo: "6012345678" o "3001234567"

5. **Actividad económica principal (Campo 46)**:
   - Campo 46 tiene DOS partes: el CÓDIGO CIIU (4 dígitos) y la DESCRIPCIÓN de la actividad.
   - "codigo_ciiu": solo los 4 dígitos del código CIIU (ejemplo: "6201")
   - "actividad_economica": la descripción textual (ejemplo: "Actividades de desarrollo de sistemas informáticos")

6. **Correo electrónico (Campo 42)**:
   - Busca "42" o "Correo electrónico" o dirección de email (contiene @).

7. **Dirección (Campo 40)**:
   - Busca "40" o "Dirección" o "Domicilio principal".

8. **Responsabilidades tributarias**:
   - Busca sección "Responsabilidades, Calidades y Atributos" o códigos como: 05 (IVA), 07 (ReteFuente), 09 (ICA), 11 (Ventas régimen simple).

Extrae en formato JSON. Si un campo no está, usa null:
{
  "nit": "NIT del campo 5 (formato XXXXXXXXX-Y, ej: 900123456-7). NUNCA el número de formulario.",
  "razon_social": "nombre completo empresa o persona",
  "tipo_contribuyente": "persona_natural" o "persona_juridica",
  "actividad_economica": "descripción completa de la actividad económica principal del campo 46",
  "codigo_ciiu": "código CIIU de 4 dígitos del campo 46",
  "direccion": "dirección fiscal completa",
  "email": "correo electrónico",
  "telefono": "número de teléfono del campo 44 Teléfono 1",
  "responsabilidades": ["lista de responsabilidades tributarias"],
  "confianza": número del 0 al 100
}

Responde ÚNICAMENTE con el JSON válido, sin markdown, sin explicaciones adicionales.`

  try {
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.1, // Baja temperatura para mayor precisión
      max_tokens: 500,
    })

    const responseText = completion.choices[0]?.message?.content ?? '{}'

    // Parsear JSON de la respuesta
    const cleanJson = responseText
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim()

    const parsed = JSON.parse(cleanJson)

    return {
      nit: parsed.nit ?? undefined,
      razon_social: parsed.razon_social ?? undefined,
      tipo_contribuyente: parsed.tipo_contribuyente ?? undefined,
      actividad_economica: parsed.actividad_economica ?? undefined,
      codigo_ciiu: parsed.codigo_ciiu ?? undefined,
      direccion: parsed.direccion ?? undefined,
      email: parsed.email ?? undefined,
      telefono: parsed.telefono ?? undefined,
      responsabilidades: Array.isArray(parsed.responsabilidades)
        ? parsed.responsabilidades
        : [],
      raw_text: rawText.slice(0, 1000),
      confianza: parsed.confianza ?? 50,
    }
  } catch (error) {
    console.error('[RUT Parser] Error al parsear con IA:', error)
    // Retornar datos mínimos con el texto raw
    return {
      raw_text: rawText.slice(0, 1000),
      confianza: 0,
    }
  }
}

// Función principal: procesar archivo RUT
export async function processRUTFile(
  fileBuffer: Buffer,
  mimeType: string
): Promise<ExtractedRutData> {
  let rawText = ''

  try {
    if (mimeType === 'application/pdf') {
      rawText = await extractTextFromPDF(fileBuffer)
    } else if (mimeType.startsWith('image/')) {
      rawText = await extractTextFromImage(fileBuffer)
    } else {
      throw new Error('Tipo de archivo no soportado. Use PDF o imagen (JPG/PNG)')
    }

    if (!rawText || rawText.trim().length < 10) {
      throw new Error('No se pudo extraer texto del archivo')
    }

    return await parseRUTWithAI(rawText)
  } catch (error) {
    console.error('[RUT Parser] Error al procesar archivo:', error)
    throw error
  }
}
