-- ============================================================
-- Migración: Sistema de Tareas, Notificaciones y FAQs mejoradas
-- Fecha: 2026-03-15
-- ============================================================

-- ─── TIPOS ENUM NUEVOS ────────────────────────────────────────────────────

CREATE TYPE task_status AS ENUM ('pendiente', 'en_progreso', 'completada', 'cancelada');
CREATE TYPE task_prioridad AS ENUM ('alta', 'media', 'baja');
CREATE TYPE task_tipo AS ENUM (
  'documento_pendiente',
  'declaracion_tributaria',
  'revision_contable',
  'reunion',
  'pago',
  'envio_informacion',
  'renovacion',
  'otro'
);

CREATE TYPE notification_tipo AS ENUM (
  'tarea_asignada',
  'tarea_vencida',
  'obligacion_proxima',
  'obligacion_vencida',
  'documento_subido',
  'estado_financiero',
  'mensaje_nuevo',
  'sistema'
);

-- ─── TABLA: tasks ─────────────────────────────────────────────────────────

CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  titulo TEXT NOT NULL,
  descripcion TEXT,
  tipo task_tipo NOT NULL DEFAULT 'otro',
  status task_status NOT NULL DEFAULT 'pendiente',
  prioridad task_prioridad NOT NULL DEFAULT 'media',
  fecha_limite DATE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES profiles(id),
  assigned_to UUID REFERENCES profiles(id),
  visible_cliente BOOLEAN NOT NULL DEFAULT false,
  completada_en TIMESTAMPTZ,
  notas TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_tasks_client_id ON tasks(client_id);
CREATE INDEX idx_tasks_created_by ON tasks(created_by);
CREATE INDEX idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_fecha_limite ON tasks(fecha_limite);

-- ─── TABLA: notifications ─────────────────────────────────────────────────

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tipo notification_tipo NOT NULL,
  titulo TEXT NOT NULL,
  mensaje TEXT NOT NULL,
  leido BOOLEAN NOT NULL DEFAULT false,
  leido_en TIMESTAMPTZ,
  link_url TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_leido ON notifications(leido);
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);

-- ─── RLS: tasks ───────────────────────────────────────────────────────────

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- Administradores: acceso total
CREATE POLICY "tasks_admin_all" ON tasks
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'administrador'
    )
  );

-- Contadores: ven las tareas que crearon o tienen asignadas
CREATE POLICY "tasks_contador_select" ON tasks
  FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid()
    OR assigned_to = auth.uid()
    OR EXISTS (
      SELECT 1 FROM clients c
      JOIN profiles p ON p.id = auth.uid()
      WHERE c.id = tasks.client_id
        AND c.contador_id = auth.uid()
        AND p.role = 'contador'
    )
  );

CREATE POLICY "tasks_contador_insert" ON tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('contador', 'administrador')
    )
  );

CREATE POLICY "tasks_contador_update" ON tasks
  FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR assigned_to = auth.uid()
    OR EXISTS (
      SELECT 1 FROM clients c WHERE c.id = tasks.client_id AND c.contador_id = auth.uid()
    )
  );

-- Clientes: solo ven tareas marcadas como visible_cliente y de su propio cliente
CREATE POLICY "tasks_cliente_select" ON tasks
  FOR SELECT
  TO authenticated
  USING (
    visible_cliente = true
    AND EXISTS (
      SELECT 1 FROM clients c
      JOIN profiles p ON p.id = auth.uid()
      WHERE c.id = tasks.client_id
        AND c.email = (SELECT email FROM profiles WHERE id = auth.uid())
        AND p.role = 'cliente'
    )
  );

-- ─── RLS: notifications ───────────────────────────────────────────────────

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_own" ON notifications
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Admins pueden ver todas las notificaciones
CREATE POLICY "notifications_admin" ON notifications
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'administrador'
    )
  );

-- ─── FUNCIÓN: crear notificación automática al asignar tarea ──────────────

CREATE OR REPLACE FUNCTION notify_task_assigned()
RETURNS TRIGGER AS $$
BEGIN
  -- Notificar al usuario asignado si es diferente al creador
  IF NEW.assigned_to IS NOT NULL AND NEW.assigned_to != NEW.created_by THEN
    INSERT INTO notifications (user_id, tipo, titulo, mensaje, link_url, metadata)
    VALUES (
      NEW.assigned_to,
      'tarea_asignada',
      'Nueva tarea asignada',
      'Se te ha asignado la tarea: ' || NEW.titulo,
      '/tareas',
      jsonb_build_object('task_id', NEW.id, 'tipo', NEW.tipo)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER tasks_notify_assigned
  AFTER INSERT ON tasks
  FOR EACH ROW EXECUTE FUNCTION notify_task_assigned();

-- ─── DATOS INICIALES: actualizar chatbot_faqs con categorías ──────────────

-- Agregar columna orden si no existe
ALTER TABLE chatbot_faqs ADD COLUMN IF NOT EXISTS orden INTEGER DEFAULT 0;
ALTER TABLE chatbot_faqs ADD COLUMN IF NOT EXISTS tags TEXT[];

-- Índice en categoria para búsquedas rápidas del chatbot
CREATE INDEX IF NOT EXISTS idx_chatbot_faqs_categoria ON chatbot_faqs(categoria);
CREATE INDEX IF NOT EXISTS idx_chatbot_faqs_activo ON chatbot_faqs(activo);
