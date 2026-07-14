// Tipos globales de CALA ASOCIADOS
// Interfaces TypeScript para todo el sistema

// ─── ENUMS ─────────────────────────────────────────────────────────────────

export type UserRole = 'administrador' | 'contador' | 'cliente'

export type TipoImpuesto =
  | 'IVA_BIMESTRAL'
  | 'IVA_CUATRIMESTRAL'
  | 'IVA_ANUAL'
  | 'RETENCION_FUENTE_MENSUAL'
  | 'RENTA_ANUAL'
  | 'RENTA_BIMESTRAL_ANTICIPO'
  | 'ICA_BIMESTRAL'
  | 'ICA_TRIMESTRAL'
  | 'ICA_ANUAL'
  | 'EXOGENA_ANUAL'
  | 'RETENCION_ICA_BIMESTRAL'
  | 'PATRIMONIO_ANUAL'
  | 'GMF'
  | 'OTROS'

export type TipoContribuyente = 'persona_natural' | 'persona_juridica'

export type Periodicidad =
  | 'mensual'
  | 'bimestral'
  | 'trimestral'
  | 'cuatrimestral'
  | 'semestral'
  | 'anual'

export type ReminderStatus = 'pendiente' | 'enviado' | 'fallido' | 'cancelado'

export type FinancialStatementType = 'balance' | 'pyg' | 'flujo'

export type PeriodoTipo = 'mes' | 'trimestre' | 'semestre' | 'año'

export type ChatChannel = 'web' | 'whatsapp'

export type ChatRole = 'user' | 'assistant' | 'system'

// ─── USUARIO / PERFIL ──────────────────────────────────────────────────────

export interface UserProfile {
  id: string
  email: string
  nombre: string
  apellido: string
  role: UserRole
  telefono?: string
  whatsapp?: string
  avatar_url?: string
  activo: boolean
  created_at: string
  updated_at: string
}

// ─── CLIENTES ──────────────────────────────────────────────────────────────

export interface Client {
  id: string
  nit: string
  razon_social: string
  tipo: TipoContribuyente
  actividad_economica?: string
  codigo_ciiu?: string
  direccion?: string
  email?: string
  telefono?: string
  whatsapp?: string
  contador_id: string
  activo: boolean
  created_at: string
  updated_at: string
  // Relaciones opcionales
  contador?: UserProfile
  tax_obligations?: TaxObligation[]
  rut_files?: RutFile[]
}

export interface ClientFormData {
  nit: string
  razon_social: string
  tipo: TipoContribuyente
  actividad_economica?: string
  codigo_ciiu?: string
  direccion?: string
  email?: string
  telefono?: string
  whatsapp?: string
  contador_id: string
}

// ─── OBLIGACIONES TRIBUTARIAS ──────────────────────────────────────────────

export interface TaxObligation {
  id: string
  client_id: string
  tipo_impuesto: TipoImpuesto
  periodicidad: Periodicidad
  regimen?: string
  fecha_inicio: string
  activo: boolean
  notas?: string
  created_at: string
  updated_at: string
}

export interface TaxObligationFormData {
  tipo_impuesto: TipoImpuesto
  periodicidad: Periodicidad
  regimen?: string
  fecha_inicio: string
  notas?: string
}

// ─── ARCHIVOS RUT ──────────────────────────────────────────────────────────

export interface RutFile {
  id: string
  client_id: string
  file_url: string
  extracted_data_json: ExtractedRutData | null
  uploaded_at: string
  version: number
}

export interface ExtractedRutData {
  nit?: string
  razon_social?: string
  tipo_contribuyente?: TipoContribuyente
  actividad_economica?: string
  codigo_ciiu?: string
  direccion?: string
  email?: string
  telefono?: string
  responsabilidades?: string[]
  raw_text?: string
  confianza?: number
}

// ─── CALENDARIO TRIBUTARIO ─────────────────────────────────────────────────

export interface TaxCalendarEntry {
  id: string
  tipo_impuesto: TipoImpuesto
  año: number
  mes: number
  dia_vencimiento: number
  fecha_vencimiento: string
  digitos_nit?: string
  descripcion?: string
  created_at: string
  // Enriquecido en el servidor para el panel del contador
  clientes_aplicables?: string[]
}

// ─── RECORDATORIOS ────────────────────────────────────────────────────────

export interface Reminder {
  id: string
  client_id: string
  obligation_id?: string
  tipo: 'mensual' | 'anticipado' | 'urgente' | 'vencido'
  fecha_vencimiento: string
  days_before: number
  sent_at?: string
  status: ReminderStatus
  whatsapp_message_id?: string
  created_at: string
  // Relaciones
  client?: Client
}

export interface ReminderConfig {
  id: string
  days_before: number
  active: boolean
  send_to_client: boolean
  send_to_contador: boolean
  template_id?: string
}

export interface WhatsappTemplate {
  id: string
  nombre: string
  tipo: 'mensual_contador' | 'anticipado_cliente' | 'dia_vencimiento' | 'urgente_vencido'
  contenido: string
  variables_json: Record<string, string>
  activo: boolean
}

// ─── CHATBOT ──────────────────────────────────────────────────────────────

export interface ChatSession {
  id: string
  user_id: string
  channel: ChatChannel
  created_at: string
  // Relaciones
  messages?: ChatMessage[]
}

export interface ChatMessage {
  id: string
  session_id: string
  role: ChatRole
  content: string
  created_at: string
}

export interface ChatbotFaq {
  id: string
  pregunta: string
  respuesta: string
  categoria: string
  activo: boolean
}

// ─── ESTADOS FINANCIEROS ──────────────────────────────────────────────────

export interface FinancialStatement {
  id: string
  client_id: string
  tipo: FinancialStatementType
  periodo_tipo: PeriodoTipo
  periodo_valor: number
  año: number
  raw_data_json?: Record<string, unknown>
  processed_data_json?: ProcessedFinancialData
  uploaded_by: string
  created_at: string
}

export interface FinancialLineItem {
  id: string
  statement_id: string
  categoria: string
  subcategoria?: string
  nombre_cuenta: string
  valor: number
  orden: number
}

export interface ProcessedFinancialData {
  // Balance General
  activos_corrientes?: number
  activos_no_corrientes?: number
  total_activos?: number
  pasivos_corrientes?: number
  pasivos_no_corrientes?: number
  total_pasivos?: number
  patrimonio?: number
  // Estado de Resultados
  ingresos?: number
  costo_ventas?: number
  utilidad_bruta?: number
  gastos_operacionales?: number
  utilidad_operacional?: number
  ingresos_no_operacionales?: number
  gastos_no_operacionales?: number
  utilidad_antes_impuestos?: number
  impuesto_renta?: number
  utilidad_neta?: number
  // Flujo de Caja
  flujo_operacional?: number
  flujo_inversion?: number
  flujo_financiacion?: number
  flujo_neto?: number
}

// ─── INDICADORES FINANCIEROS ──────────────────────────────────────────────

export interface FinancialIndicators {
  razon_corriente?: number
  prueba_acida?: number
  nivel_endeudamiento?: number
  roa?: number
  roe?: number
  margen_bruto?: number
  margen_operacional?: number
  margen_neto?: number
  ebitda?: number
  rotacion_cartera?: number
  rotacion_inventarios?: number
  rotacion_proveedores?: number
}

// ─── ANÁLISIS IA ──────────────────────────────────────────────────────────

export interface AiInsight {
  id: string
  client_id: string
  statement_id: string
  tendencias: string[]
  fortalezas: string[]
  riesgos: string[]
  recomendaciones: string[]
  prediccion_ingresos?: number[]
  prediccion_flujo?: number[]
  semaforo?: 'verde' | 'amarillo' | 'rojo'
  created_at: string
}

// ─── AUDIT LOGS ──────────────────────────────────────────────────────────

export interface AuditLog {
  id: string
  user_id: string
  accion: string
  tabla: string
  registro_id?: string
  datos_anteriores?: Record<string, unknown>
  datos_nuevos?: Record<string, unknown>
  ip_address?: string
  created_at: string
}

// ─── DECLARACIONES TRIBUTARIAS ───────────────────────────────────────────

export type DeclarationStatus =
  | 'pendiente_info'
  | 'en_proceso'
  | 'lista_revisar'
  | 'presentada'
  | 'pagada'
  | 'no_aplica'
  | 'rechazada'

export interface Declaration {
  id: string
  client_id: string
  obligation_id?: string
  tipo_impuesto: TipoImpuesto
  periodo_mes?: number
  periodo_año: number
  fecha_vencimiento?: string
  status: DeclarationStatus
  // Datos económicos
  monto_impuesto?: number
  monto_sanciones?: number
  monto_total?: number
  formulario?: string
  numero_radicado?: string
  fecha_presentacion?: string
  fecha_pago?: string
  // Gestión
  contador_id?: string
  notas_internas?: string
  notas_cliente?: string
  info_solicitada?: string
  fecha_info_solicitada?: string
  // Archivos
  archivo_declaracion_url?: string
  archivo_pago_url?: string
  activo: boolean
  created_by?: string
  created_at: string
  updated_at: string
  // Relaciones opcionales
  client?: Pick<Client, 'id' | 'nit' | 'razon_social'>
  contador?: Pick<UserProfile, 'id' | 'nombre' | 'apellido'>
  history?: DeclarationHistoryEntry[]
}

export interface DeclarationHistoryEntry {
  id: string
  declaration_id: string
  status_anterior?: DeclarationStatus
  status_nuevo: DeclarationStatus
  comentario?: string
  changed_by: string
  created_at: string
  changer?: Pick<UserProfile, 'id' | 'nombre' | 'apellido'>
}

export interface DeclarationFormData {
  client_id: string
  tipo_impuesto: TipoImpuesto
  periodo_mes?: number
  periodo_año: number
  fecha_vencimiento?: string
  status?: DeclarationStatus
  monto_impuesto?: number
  monto_sanciones?: number
  monto_total?: number
  formulario?: string
  notas_internas?: string
  notas_cliente?: string
  info_solicitada?: string
}

// ─── TAREAS ──────────────────────────────────────────────────────────────

export type TaskStatus = 'pendiente' | 'en_progreso' | 'completada' | 'cancelada'
export type TaskPrioridad = 'alta' | 'media' | 'baja'
export type TaskTipo =
  | 'documento_pendiente'
  | 'declaracion_tributaria'
  | 'revision_contable'
  | 'reunion'
  | 'pago'
  | 'envio_informacion'
  | 'renovacion'
  | 'otro'

export interface Task {
  id: string
  titulo: string
  descripcion?: string
  tipo: TaskTipo
  status: TaskStatus
  prioridad: TaskPrioridad
  fecha_limite?: string
  client_id?: string
  created_by: string
  assigned_to?: string
  visible_cliente: boolean
  completada_en?: string
  notas?: string
  activo: boolean
  created_at: string
  updated_at: string
  // Relaciones opcionales
  client?: Pick<Client, 'id' | 'nit' | 'razon_social'>
  creator?: Pick<UserProfile, 'id' | 'nombre' | 'apellido'>
  assignee?: Pick<UserProfile, 'id' | 'nombre' | 'apellido'>
}

export interface TaskFormData {
  titulo: string
  descripcion?: string
  tipo: TaskTipo
  prioridad: TaskPrioridad
  fecha_limite?: string
  client_id?: string
  assigned_to?: string
  visible_cliente: boolean
  notas?: string
}

// ─── NOTIFICACIONES ──────────────────────────────────────────────────────

export type NotificationTipo =
  | 'tarea_asignada'
  | 'tarea_vencida'
  | 'obligacion_proxima'
  | 'obligacion_vencida'
  | 'documento_subido'
  | 'estado_financiero'
  | 'mensaje_nuevo'
  | 'sistema'

export interface Notification {
  id: string
  user_id: string
  tipo: NotificationTipo
  titulo: string
  mensaje: string
  leido: boolean
  leido_en?: string
  link_url?: string
  metadata?: Record<string, unknown>
  created_at: string
}

// ─── API RESPONSES ───────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data?: T
  error?: string
  message?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  per_page: number
  total_pages: number
}

// ─── DASHBOARD KPIs ──────────────────────────────────────────────────────

export interface DashboardStats {
  total_clientes: number
  obligaciones_vencidas: number
  obligaciones_proximas: number
  estados_financieros_mes: number
  recordatorios_enviados: number
  chat_sesiones: number
}
