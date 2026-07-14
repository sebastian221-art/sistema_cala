-- ============================================================
-- ContaFlow Pro - Schema completo de Supabase (PostgreSQL)
-- Ejecutar en el SQL Editor de Supabase
-- ============================================================

-- Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- Para búsqueda de texto

-- ─── TIPOS ENUM ────────────────────────────────────────────────────────────

CREATE TYPE user_role AS ENUM ('administrador', 'contador', 'cliente');

CREATE TYPE tipo_impuesto AS ENUM (
  'IVA_BIMESTRAL', 'IVA_CUATRIMESTRAL', 'IVA_ANUAL',
  'RETENCION_FUENTE_MENSUAL', 'RENTA_ANUAL', 'RENTA_BIMESTRAL_ANTICIPO',
  'ICA_BIMESTRAL', 'ICA_TRIMESTRAL', 'ICA_ANUAL',
  'EXOGENA_ANUAL', 'RETENCION_ICA_BIMESTRAL',
  'PATRIMONIO_ANUAL', 'GMF', 'OTROS'
);

CREATE TYPE tipo_contribuyente AS ENUM ('persona_natural', 'persona_juridica');

CREATE TYPE periodicidad AS ENUM (
  'mensual', 'bimestral', 'trimestral', 'cuatrimestral', 'semestral', 'anual'
);

CREATE TYPE reminder_status AS ENUM ('pendiente', 'enviado', 'fallido', 'cancelado');

CREATE TYPE financial_statement_type AS ENUM ('balance', 'pyg', 'flujo');

CREATE TYPE periodo_tipo AS ENUM ('mes', 'trimestre', 'semestre', 'año');

CREATE TYPE chat_channel AS ENUM ('web', 'whatsapp');

CREATE TYPE chat_role AS ENUM ('user', 'assistant', 'system');

-- ─── TABLA: profiles (extiende auth.users de Supabase) ────────────────────

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  nombre TEXT NOT NULL,
  apellido TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'cliente',
  telefono TEXT,
  whatsapp TEXT,
  avatar_url TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── TABLA: clients ───────────────────────────────────────────────────────

CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nit TEXT NOT NULL,
  razon_social TEXT NOT NULL,
  tipo tipo_contribuyente NOT NULL DEFAULT 'persona_juridica',
  actividad_economica TEXT,
  codigo_ciiu TEXT,
  direccion TEXT,
  email TEXT,
  telefono TEXT,
  whatsapp TEXT,
  contador_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT clients_nit_unique UNIQUE (nit)
);

CREATE TRIGGER clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_clients_contador_id ON clients(contador_id);
CREATE INDEX idx_clients_nit ON clients(nit);
CREATE INDEX idx_clients_razon_social ON clients USING gin(razon_social gin_trgm_ops);

-- ─── TABLA: tax_obligations ───────────────────────────────────────────────

CREATE TABLE tax_obligations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  tipo_impuesto tipo_impuesto NOT NULL,
  periodicidad periodicidad NOT NULL,
  regimen TEXT,
  fecha_inicio DATE NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT true,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER tax_obligations_updated_at
  BEFORE UPDATE ON tax_obligations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_tax_obligations_client_id ON tax_obligations(client_id);
CREATE INDEX idx_tax_obligations_tipo ON tax_obligations(tipo_impuesto);

-- ─── TABLA: rut_files ────────────────────────────────────────────────────

CREATE TABLE rut_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  extracted_data_json JSONB,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  version INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_rut_files_client_id ON rut_files(client_id);

-- ─── TABLA: tax_calendar ─────────────────────────────────────────────────

CREATE TABLE tax_calendar (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tipo_impuesto tipo_impuesto NOT NULL,
  año INTEGER NOT NULL,
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  dia_vencimiento INTEGER NOT NULL CHECK (dia_vencimiento BETWEEN 1 AND 31),
  fecha_vencimiento DATE NOT NULL,
  digitos_nit TEXT, -- NULL = aplica a todos, '01-09' = rango de dígitos
  descripcion TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tax_calendar_tipo_año ON tax_calendar(tipo_impuesto, año);
CREATE INDEX idx_tax_calendar_fecha ON tax_calendar(fecha_vencimiento);

-- ─── TABLA: whatsapp_templates ────────────────────────────────────────────

CREATE TABLE whatsapp_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('mensual_contador', 'anticipado_cliente', 'dia_vencimiento', 'urgente_vencido')),
  contenido TEXT NOT NULL,
  variables_json JSONB NOT NULL DEFAULT '{}',
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── TABLA: reminder_configs ─────────────────────────────────────────────

CREATE TABLE reminder_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  days_before INTEGER NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  send_to_client BOOLEAN NOT NULL DEFAULT true,
  send_to_contador BOOLEAN NOT NULL DEFAULT true,
  template_id UUID REFERENCES whatsapp_templates(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Configuraciones por defecto
INSERT INTO reminder_configs (days_before, active, send_to_client, send_to_contador) VALUES
(15, true, false, true),
(10, true, false, true),
(7, true, true, true),
(5, true, true, true),
(3, true, true, true),
(1, true, true, true);

-- ─── TABLA: reminders ────────────────────────────────────────────────────

CREATE TABLE reminders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  obligation_id UUID REFERENCES tax_obligations(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('mensual', 'anticipado', 'urgente', 'vencido')),
  fecha_vencimiento DATE NOT NULL,
  days_before INTEGER NOT NULL DEFAULT 0,
  sent_at TIMESTAMPTZ,
  status reminder_status NOT NULL DEFAULT 'pendiente',
  whatsapp_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reminders_client_id ON reminders(client_id);
CREATE INDEX idx_reminders_fecha ON reminders(fecha_vencimiento);
CREATE INDEX idx_reminders_status ON reminders(status);

-- ─── TABLA: chat_sessions ────────────────────────────────────────────────

CREATE TABLE chat_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  channel chat_channel NOT NULL DEFAULT 'web',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_sessions_user_id ON chat_sessions(user_id);

-- ─── TABLA: chat_messages ────────────────────────────────────────────────

CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role chat_role NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_messages_session_id ON chat_messages(session_id);

-- ─── TABLA: chatbot_faqs ─────────────────────────────────────────────────

CREATE TABLE chatbot_faqs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pregunta TEXT NOT NULL,
  respuesta TEXT NOT NULL,
  categoria TEXT NOT NULL DEFAULT 'general',
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── TABLA: financial_statements ─────────────────────────────────────────

CREATE TABLE financial_statements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  tipo financial_statement_type NOT NULL,
  periodo_tipo periodo_tipo NOT NULL,
  periodo_valor INTEGER NOT NULL,
  año INTEGER NOT NULL,
  raw_data_json JSONB,
  processed_data_json JSONB,
  uploaded_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_financial_statements_client_id ON financial_statements(client_id);
CREATE INDEX idx_financial_statements_periodo ON financial_statements(año, periodo_tipo, periodo_valor);

-- ─── TABLA: financial_line_items ─────────────────────────────────────────

CREATE TABLE financial_line_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  statement_id UUID NOT NULL REFERENCES financial_statements(id) ON DELETE CASCADE,
  categoria TEXT NOT NULL,
  subcategoria TEXT,
  nombre_cuenta TEXT NOT NULL,
  valor NUMERIC(20, 2) NOT NULL DEFAULT 0,
  orden INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_financial_line_items_statement_id ON financial_line_items(statement_id);

-- ─── TABLA: ai_insights ──────────────────────────────────────────────────

CREATE TABLE ai_insights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  statement_id UUID REFERENCES financial_statements(id) ON DELETE SET NULL,
  tendencias TEXT[] NOT NULL DEFAULT '{}',
  fortalezas TEXT[] NOT NULL DEFAULT '{}',
  riesgos TEXT[] NOT NULL DEFAULT '{}',
  recomendaciones TEXT[] NOT NULL DEFAULT '{}',
  prediccion_ingresos NUMERIC(20, 2)[],
  prediccion_flujo NUMERIC(20, 2)[],
  semaforo TEXT CHECK (semaforo IN ('verde', 'amarillo', 'rojo')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_insights_client_id ON ai_insights(client_id);

-- ─── TABLA: audit_logs ───────────────────────────────────────────────────

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  accion TEXT NOT NULL,
  tabla TEXT NOT NULL,
  registro_id TEXT,
  datos_anteriores JSONB,
  datos_nuevos JSONB,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_tabla ON audit_logs(tabla);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- ─── ROW LEVEL SECURITY (RLS) ────────────────────────────────────────────

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_obligations ENABLE ROW LEVEL SECURITY;
ALTER TABLE rut_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Función helper para obtener el rol del usuario actual
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ─── POLÍTICAS RLS: profiles ─────────────────────────────────────────────

-- Todos ven su propio perfil
CREATE POLICY "profiles_select_own" ON profiles
  FOR SELECT USING (id = auth.uid());

-- Administradores ven todos los perfiles
CREATE POLICY "profiles_select_admin" ON profiles
  FOR SELECT USING (get_user_role() = 'administrador');

-- Solo el usuario puede actualizar su propio perfil
CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (id = auth.uid());

-- Administrador puede actualizar cualquier perfil
CREATE POLICY "profiles_update_admin" ON profiles
  FOR UPDATE USING (get_user_role() = 'administrador');

-- ─── POLÍTICAS RLS: clients ──────────────────────────────────────────────

-- Contador ve solo sus clientes asignados
CREATE POLICY "clients_select_contador" ON clients
  FOR SELECT USING (
    contador_id = auth.uid()
    OR get_user_role() = 'administrador'
  );

-- Cliente ve solo su propio registro
CREATE POLICY "clients_select_cliente" ON clients
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'cliente'
      AND profiles.email = clients.email
    )
  );

-- Contador e admin pueden crear clientes
CREATE POLICY "clients_insert" ON clients
  FOR INSERT WITH CHECK (
    get_user_role() IN ('administrador', 'contador')
    AND (get_user_role() = 'administrador' OR contador_id = auth.uid())
  );

-- Contador puede actualizar sus clientes, admin todos
CREATE POLICY "clients_update" ON clients
  FOR UPDATE USING (
    contador_id = auth.uid()
    OR get_user_role() = 'administrador'
  );

-- Solo admin puede eliminar (soft delete recomendado)
CREATE POLICY "clients_delete" ON clients
  FOR DELETE USING (get_user_role() = 'administrador');

-- ─── POLÍTICAS RLS: tax_obligations ─────────────────────────────────────

CREATE POLICY "tax_obligations_select" ON tax_obligations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM clients
      WHERE clients.id = tax_obligations.client_id
      AND (clients.contador_id = auth.uid() OR get_user_role() = 'administrador')
    )
  );

CREATE POLICY "tax_obligations_insert" ON tax_obligations
  FOR INSERT WITH CHECK (
    get_user_role() IN ('administrador', 'contador')
  );

CREATE POLICY "tax_obligations_update" ON tax_obligations
  FOR UPDATE USING (
    get_user_role() IN ('administrador', 'contador')
  );

-- ─── POLÍTICAS RLS: financial_statements ────────────────────────────────

CREATE POLICY "financial_statements_select" ON financial_statements
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM clients
      WHERE clients.id = financial_statements.client_id
      AND (clients.contador_id = auth.uid() OR get_user_role() = 'administrador')
    )
    OR uploaded_by = auth.uid()
  );

CREATE POLICY "financial_statements_insert" ON financial_statements
  FOR INSERT WITH CHECK (
    get_user_role() IN ('administrador', 'contador')
  );

-- ─── POLÍTICAS RLS: chat_sessions y chat_messages ────────────────────────

CREATE POLICY "chat_sessions_select" ON chat_sessions
  FOR SELECT USING (
    user_id = auth.uid()
    OR get_user_role() = 'administrador'
  );

CREATE POLICY "chat_sessions_insert" ON chat_sessions
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "chat_messages_select" ON chat_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM chat_sessions
      WHERE chat_sessions.id = chat_messages.session_id
      AND (chat_sessions.user_id = auth.uid() OR get_user_role() = 'administrador')
    )
  );

CREATE POLICY "chat_messages_insert" ON chat_messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM chat_sessions
      WHERE chat_sessions.id = chat_messages.session_id
      AND chat_sessions.user_id = auth.uid()
    )
  );

-- ─── POLÍTICAS RLS: audit_logs ───────────────────────────────────────────

CREATE POLICY "audit_logs_select" ON audit_logs
  FOR SELECT USING (get_user_role() = 'administrador');

CREATE POLICY "audit_logs_insert" ON audit_logs
  FOR INSERT WITH CHECK (true); -- Service role inserta, usuarios no directamente

-- ─── POLÍTICAS RLS: tax_calendar ─────────────────────────────────────────

CREATE POLICY "tax_calendar_select_all" ON tax_calendar
  FOR SELECT USING (true); -- Todos pueden ver el calendario

CREATE POLICY "tax_calendar_insert_admin" ON tax_calendar
  FOR INSERT WITH CHECK (get_user_role() = 'administrador');

CREATE POLICY "tax_calendar_update_admin" ON tax_calendar
  FOR UPDATE USING (get_user_role() = 'administrador');

CREATE POLICY "tax_calendar_delete_admin" ON tax_calendar
  FOR DELETE USING (get_user_role() = 'administrador');

-- ─── FUNCIÓN: crear perfil automáticamente al registrarse ────────────────

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, nombre, apellido, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nombre', 'Usuario'),
    COALESCE(NEW.raw_user_meta_data->>'apellido', ''),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'cliente')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ─── DATOS SEMILLA: Calendario Tributario DIAN Colombia 2025 ─────────────

-- IVA Bimestral 2025 (grandes contribuyentes)
INSERT INTO tax_calendar (tipo_impuesto, año, mes, dia_vencimiento, fecha_vencimiento, descripcion) VALUES
('IVA_BIMESTRAL', 2025, 2, 12, '2025-02-12', 'IVA Bimestral Enero-Febrero 2025'),
('IVA_BIMESTRAL', 2025, 4, 15, '2025-04-15', 'IVA Bimestral Marzo-Abril 2025'),
('IVA_BIMESTRAL', 2025, 6, 13, '2025-06-13', 'IVA Bimestral Mayo-Junio 2025'),
('IVA_BIMESTRAL', 2025, 8, 13, '2025-08-13', 'IVA Bimestral Julio-Agosto 2025'),
('IVA_BIMESTRAL', 2025, 10, 14, '2025-10-14', 'IVA Bimestral Septiembre-Octubre 2025'),
('IVA_BIMESTRAL', 2025, 12, 12, '2025-12-12', 'IVA Bimestral Noviembre-Diciembre 2025');

-- Retención en la Fuente 2025 (mensual)
INSERT INTO tax_calendar (tipo_impuesto, año, mes, dia_vencimiento, fecha_vencimiento, descripcion) VALUES
('RETENCION_FUENTE_MENSUAL', 2025, 1, 23, '2025-01-23', 'Retención Fuente Diciembre 2024'),
('RETENCION_FUENTE_MENSUAL', 2025, 2, 21, '2025-02-21', 'Retención Fuente Enero 2025'),
('RETENCION_FUENTE_MENSUAL', 2025, 3, 21, '2025-03-21', 'Retención Fuente Febrero 2025'),
('RETENCION_FUENTE_MENSUAL', 2025, 4, 23, '2025-04-23', 'Retención Fuente Marzo 2025'),
('RETENCION_FUENTE_MENSUAL', 2025, 5, 22, '2025-05-22', 'Retención Fuente Abril 2025'),
('RETENCION_FUENTE_MENSUAL', 2025, 6, 23, '2025-06-23', 'Retención Fuente Mayo 2025'),
('RETENCION_FUENTE_MENSUAL', 2025, 7, 23, '2025-07-23', 'Retención Fuente Junio 2025'),
('RETENCION_FUENTE_MENSUAL', 2025, 8, 22, '2025-08-22', 'Retención Fuente Julio 2025'),
('RETENCION_FUENTE_MENSUAL', 2025, 9, 23, '2025-09-23', 'Retención Fuente Agosto 2025'),
('RETENCION_FUENTE_MENSUAL', 2025, 10, 23, '2025-10-23', 'Retención Fuente Septiembre 2025'),
('RETENCION_FUENTE_MENSUAL', 2025, 11, 21, '2025-11-21', 'Retención Fuente Octubre 2025'),
('RETENCION_FUENTE_MENSUAL', 2025, 12, 19, '2025-12-19', 'Retención Fuente Noviembre 2025');

-- Renta Anual 2025
INSERT INTO tax_calendar (tipo_impuesto, año, mes, dia_vencimiento, fecha_vencimiento, digitos_nit, descripcion) VALUES
('RENTA_ANUAL', 2025, 4, 9, '2025-04-09', '01-05', 'Renta Anual 2024 - NIT 01-05'),
('RENTA_ANUAL', 2025, 4, 10, '2025-04-10', '06-10', 'Renta Anual 2024 - NIT 06-10'),
('RENTA_ANUAL', 2025, 4, 11, '2025-04-11', '11-15', 'Renta Anual 2024 - NIT 11-15'),
('RENTA_ANUAL', 2025, 4, 14, '2025-04-14', '16-20', 'Renta Anual 2024 - NIT 16-20'),
('RENTA_ANUAL', 2025, 4, 15, '2025-04-15', '21-25', 'Renta Anual 2024 - NIT 21-25'),
('RENTA_ANUAL', 2025, 4, 16, '2025-04-16', '26-30', 'Renta Anual 2024 - NIT 26-30'),
('RENTA_ANUAL', 2025, 4, 17, '2025-04-17', '31-35', 'Renta Anual 2024 - NIT 31-35'),
('RENTA_ANUAL', 2025, 4, 22, '2025-04-22', '36-40', 'Renta Anual 2024 - NIT 36-40'),
('RENTA_ANUAL', 2025, 4, 23, '2025-04-23', '41-45', 'Renta Anual 2024 - NIT 41-45'),
('RENTA_ANUAL', 2025, 4, 24, '2025-04-24', '46-50', 'Renta Anual 2024 - NIT 46-50'),
('RENTA_ANUAL', 2025, 4, 25, '2025-04-25', '51-55', 'Renta Anual 2024 - NIT 51-55'),
('RENTA_ANUAL', 2025, 5, 6, '2025-05-06', '56-60', 'Renta Anual 2024 - NIT 56-60'),
('RENTA_ANUAL', 2025, 5, 7, '2025-05-07', '61-65', 'Renta Anual 2024 - NIT 61-65'),
('RENTA_ANUAL', 2025, 5, 8, '2025-05-08', '66-70', 'Renta Anual 2024 - NIT 66-70'),
('RENTA_ANUAL', 2025, 5, 9, '2025-05-09', '71-75', 'Renta Anual 2024 - NIT 71-75'),
('RENTA_ANUAL', 2025, 5, 12, '2025-05-12', '76-80', 'Renta Anual 2024 - NIT 76-80'),
('RENTA_ANUAL', 2025, 5, 13, '2025-05-13', '81-85', 'Renta Anual 2024 - NIT 81-85'),
('RENTA_ANUAL', 2025, 5, 14, '2025-05-14', '86-90', 'Renta Anual 2024 - NIT 86-90'),
('RENTA_ANUAL', 2025, 5, 15, '2025-05-15', '91-95', 'Renta Anual 2024 - NIT 91-95'),
('RENTA_ANUAL', 2025, 5, 16, '2025-05-16', '96-00', 'Renta Anual 2024 - NIT 96-00');

-- ─── DATOS SEMILLA: Calendario Tributario DIAN Colombia 2026 ─────────────

-- IVA Bimestral 2026
INSERT INTO tax_calendar (tipo_impuesto, año, mes, dia_vencimiento, fecha_vencimiento, descripcion) VALUES
('IVA_BIMESTRAL', 2026, 2, 13, '2026-02-13', 'IVA Bimestral Enero-Febrero 2026'),
('IVA_BIMESTRAL', 2026, 4, 15, '2026-04-15', 'IVA Bimestral Marzo-Abril 2026'),
('IVA_BIMESTRAL', 2026, 6, 12, '2026-06-12', 'IVA Bimestral Mayo-Junio 2026'),
('IVA_BIMESTRAL', 2026, 8, 14, '2026-08-14', 'IVA Bimestral Julio-Agosto 2026'),
('IVA_BIMESTRAL', 2026, 10, 13, '2026-10-13', 'IVA Bimestral Septiembre-Octubre 2026'),
('IVA_BIMESTRAL', 2026, 12, 11, '2026-12-11', 'IVA Bimestral Noviembre-Diciembre 2026');

-- Retención en la Fuente 2026 (mensual)
INSERT INTO tax_calendar (tipo_impuesto, año, mes, dia_vencimiento, fecha_vencimiento, descripcion) VALUES
('RETENCION_FUENTE_MENSUAL', 2026, 1, 22, '2026-01-22', 'Retención Fuente Diciembre 2025'),
('RETENCION_FUENTE_MENSUAL', 2026, 2, 20, '2026-02-20', 'Retención Fuente Enero 2026'),
('RETENCION_FUENTE_MENSUAL', 2026, 3, 23, '2026-03-23', 'Retención Fuente Febrero 2026'),
('RETENCION_FUENTE_MENSUAL', 2026, 4, 22, '2026-04-22', 'Retención Fuente Marzo 2026'),
('RETENCION_FUENTE_MENSUAL', 2026, 5, 21, '2026-05-21', 'Retención Fuente Abril 2026'),
('RETENCION_FUENTE_MENSUAL', 2026, 6, 22, '2026-06-22', 'Retención Fuente Mayo 2026'),
('RETENCION_FUENTE_MENSUAL', 2026, 7, 22, '2026-07-22', 'Retención Fuente Junio 2026'),
('RETENCION_FUENTE_MENSUAL', 2026, 8, 21, '2026-08-21', 'Retención Fuente Julio 2026'),
('RETENCION_FUENTE_MENSUAL', 2026, 9, 22, '2026-09-22', 'Retención Fuente Agosto 2026'),
('RETENCION_FUENTE_MENSUAL', 2026, 10, 22, '2026-10-22', 'Retención Fuente Septiembre 2026'),
('RETENCION_FUENTE_MENSUAL', 2026, 11, 20, '2026-11-20', 'Retención Fuente Octubre 2026'),
('RETENCION_FUENTE_MENSUAL', 2026, 12, 18, '2026-12-18', 'Retención Fuente Noviembre 2026');

-- Renta Anual 2026 (declaración año gravable 2025)
INSERT INTO tax_calendar (tipo_impuesto, año, mes, dia_vencimiento, fecha_vencimiento, digitos_nit, descripcion) VALUES
('RENTA_ANUAL', 2026, 4, 9, '2026-04-09', '01-05', 'Renta Anual 2025 - NIT 01-05'),
('RENTA_ANUAL', 2026, 4, 13, '2026-04-13', '06-10', 'Renta Anual 2025 - NIT 06-10'),
('RENTA_ANUAL', 2026, 4, 14, '2026-04-14', '11-15', 'Renta Anual 2025 - NIT 11-15'),
('RENTA_ANUAL', 2026, 4, 15, '2026-04-15', '16-20', 'Renta Anual 2025 - NIT 16-20'),
('RENTA_ANUAL', 2026, 4, 16, '2026-04-16', '21-25', 'Renta Anual 2025 - NIT 21-25'),
('RENTA_ANUAL', 2026, 4, 17, '2026-04-17', '26-30', 'Renta Anual 2025 - NIT 26-30'),
('RENTA_ANUAL', 2026, 4, 20, '2026-04-20', '31-35', 'Renta Anual 2025 - NIT 31-35'),
('RENTA_ANUAL', 2026, 4, 21, '2026-04-21', '36-40', 'Renta Anual 2025 - NIT 36-40'),
('RENTA_ANUAL', 2026, 4, 22, '2026-04-22', '41-45', 'Renta Anual 2025 - NIT 41-45'),
('RENTA_ANUAL', 2026, 4, 23, '2026-04-23', '46-50', 'Renta Anual 2025 - NIT 46-50'),
('RENTA_ANUAL', 2026, 4, 24, '2026-04-24', '51-55', 'Renta Anual 2025 - NIT 51-55'),
('RENTA_ANUAL', 2026, 5, 5, '2026-05-05', '56-60', 'Renta Anual 2025 - NIT 56-60'),
('RENTA_ANUAL', 2026, 5, 6, '2026-05-06', '61-65', 'Renta Anual 2025 - NIT 61-65'),
('RENTA_ANUAL', 2026, 5, 7, '2026-05-07', '66-70', 'Renta Anual 2025 - NIT 66-70'),
('RENTA_ANUAL', 2026, 5, 8, '2026-05-08', '71-75', 'Renta Anual 2025 - NIT 71-75'),
('RENTA_ANUAL', 2026, 5, 11, '2026-05-11', '76-80', 'Renta Anual 2025 - NIT 76-80'),
('RENTA_ANUAL', 2026, 5, 12, '2026-05-12', '81-85', 'Renta Anual 2025 - NIT 81-85'),
('RENTA_ANUAL', 2026, 5, 13, '2026-05-13', '86-90', 'Renta Anual 2025 - NIT 86-90'),
('RENTA_ANUAL', 2026, 5, 14, '2026-05-14', '91-95', 'Renta Anual 2025 - NIT 91-95'),
('RENTA_ANUAL', 2026, 5, 15, '2026-05-15', '96-00', 'Renta Anual 2025 - NIT 96-00');

-- ICA Bimestral 2026 (Bogotá - referencial)
INSERT INTO tax_calendar (tipo_impuesto, año, mes, dia_vencimiento, fecha_vencimiento, descripcion) VALUES
('ICA_BIMESTRAL', 2026, 3, 25, '2026-03-25', 'ICA Bimestral Enero-Febrero 2026'),
('ICA_BIMESTRAL', 2026, 5, 25, '2026-05-25', 'ICA Bimestral Marzo-Abril 2026'),
('ICA_BIMESTRAL', 2026, 7, 24, '2026-07-24', 'ICA Bimestral Mayo-Junio 2026'),
('ICA_BIMESTRAL', 2026, 9, 25, '2026-09-25', 'ICA Bimestral Julio-Agosto 2026'),
('ICA_BIMESTRAL', 2026, 11, 25, '2026-11-25', 'ICA Bimestral Septiembre-Octubre 2026');

-- FAQs iniciales del chatbot
INSERT INTO chatbot_faqs (pregunta, respuesta, categoria) VALUES
('¿Cuándo vence el IVA?', 'El IVA bimestral vence generalmente entre los días 12 y 15 del mes siguiente al período. Las fechas exactas dependen de los últimos dígitos del NIT y el calendario DIAN vigente.', 'IVA'),
('¿Qué es la retención en la fuente?', 'La retención en la fuente es un mecanismo de recaudo anticipado de impuestos. El agente retenedor descuenta un porcentaje del pago al beneficiario y lo declara mensualmente ante la DIAN.', 'Retenciones'),
('¿Cuándo se declara renta?', 'Las personas jurídicas declaran renta entre abril y mayo del año siguiente. Las personas naturales tienen un calendario escalonado según los últimos dígitos del NIT, generalmente en agosto.', 'Renta'),
('¿Qué es el ICA?', 'El Impuesto de Industria y Comercio (ICA) es un tributo municipal que grava las actividades industriales, comerciales y de servicios. Su periodicidad varía por municipio.', 'ICA'),
('¿Qué documentos necesito para declarar IVA?', 'Para declarar IVA necesitas: facturas de ventas, facturas de compras, registros contables del período, y acceso a la plataforma MUISCA de la DIAN.', 'IVA');
