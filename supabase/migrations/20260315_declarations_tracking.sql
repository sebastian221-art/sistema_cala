-- ============================================================
-- Migración: Seguimiento de Declaraciones Tributarias (Kanban)
-- Fecha: 2026-03-15
-- ============================================================

-- ─── TIPOS ENUM ───────────────────────────────────────────────────────────

CREATE TYPE declaration_status AS ENUM (
  'pendiente_info',      -- Esperando información del cliente
  'en_proceso',          -- Contador está trabajando en ella
  'lista_revisar',       -- Lista para revisión del cliente
  'presentada',          -- Presentada ante la DIAN
  'pagada',              -- Impuesto pagado
  'no_aplica',           -- No aplica en este periodo
  'rechazada'            -- Rechazada / error
);

-- ─── TABLA: declarations ──────────────────────────────────────────────────

CREATE TABLE declarations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  obligation_id UUID REFERENCES tax_obligations(id) ON DELETE SET NULL,
  tipo_impuesto tipo_impuesto NOT NULL,
  periodo_mes INTEGER CHECK (periodo_mes BETWEEN 1 AND 12),
  periodo_año INTEGER NOT NULL,
  fecha_vencimiento DATE,
  status declaration_status NOT NULL DEFAULT 'pendiente_info',

  -- Datos de la declaración
  monto_impuesto NUMERIC(18,2),         -- Valor del impuesto a pagar
  monto_sanciones NUMERIC(18,2),        -- Sanciones e intereses
  monto_total NUMERIC(18,2),            -- Total a pagar
  formulario TEXT,                       -- Número de formulario DIAN (ej: 300, 350, 490)
  numero_radicado TEXT,                  -- Número de radicado/confirmación DIAN
  fecha_presentacion DATE,              -- Cuándo se presentó
  fecha_pago DATE,                      -- Cuándo se pagó

  -- Gestión interna
  contador_id UUID REFERENCES profiles(id),
  notas_internas TEXT,                  -- Notas del contador (no visibles al cliente)
  notas_cliente TEXT,                   -- Notas visibles para el cliente
  info_solicitada TEXT,                 -- Qué información se le pidió al cliente
  fecha_info_solicitada TIMESTAMPTZ,    -- Cuándo se solicitó la info

  -- Archivos
  archivo_declaracion_url TEXT,         -- Comprobante de declaración
  archivo_pago_url TEXT,                -- Recibo de pago

  activo BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Evitar duplicados por cliente + impuesto + periodo
  CONSTRAINT declarations_unique_period UNIQUE NULLS NOT DISTINCT (
    client_id, tipo_impuesto, periodo_año, periodo_mes
  )
);

CREATE TRIGGER declarations_updated_at
  BEFORE UPDATE ON declarations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_declarations_client_id ON declarations(client_id);
CREATE INDEX idx_declarations_status ON declarations(status);
CREATE INDEX idx_declarations_tipo ON declarations(tipo_impuesto);
CREATE INDEX idx_declarations_fecha_venc ON declarations(fecha_vencimiento);
CREATE INDEX idx_declarations_contador ON declarations(contador_id);
CREATE INDEX idx_declarations_año ON declarations(periodo_año);

-- ─── TABLA: declaration_history ───────────────────────────────────────────
-- Historial de cambios de estado con comentarios

CREATE TABLE declaration_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  declaration_id UUID NOT NULL REFERENCES declarations(id) ON DELETE CASCADE,
  status_anterior declaration_status,
  status_nuevo declaration_status NOT NULL,
  comentario TEXT,
  changed_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_decl_history_declaration ON declaration_history(declaration_id);
CREATE INDEX idx_decl_history_created ON declaration_history(created_at DESC);

-- ─── FUNCIÓN: registrar historial automáticamente ────────────────────────

CREATE OR REPLACE FUNCTION track_declaration_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Solo registrar si el status cambió
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO declaration_history (
      declaration_id, status_anterior, status_nuevo, changed_by
    ) VALUES (
      NEW.id, OLD.status, NEW.status, COALESCE(NEW.contador_id, NEW.created_by, NEW.id::uuid)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER declarations_track_status
  AFTER UPDATE ON declarations
  FOR EACH ROW EXECUTE FUNCTION track_declaration_status();

-- ─── FUNCIÓN: crear notificación cuando cambia estado ────────────────────

CREATE OR REPLACE FUNCTION notify_declaration_status_change()
RETURNS TRIGGER AS $$
DECLARE
  v_client_email TEXT;
  v_client_profile_id UUID;
  v_client_name TEXT;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    -- Buscar perfil del cliente
    SELECT c.email, c.razon_social INTO v_client_email, v_client_name
    FROM clients c WHERE c.id = NEW.client_id;

    SELECT p.id INTO v_client_profile_id
    FROM profiles p WHERE p.email = v_client_email AND p.role = 'cliente';

    -- Notificar al cliente si hay un cambio relevante para él
    IF v_client_profile_id IS NOT NULL AND NEW.status IN ('lista_revisar', 'presentada', 'pagada', 'pendiente_info') THEN
      INSERT INTO notifications (user_id, tipo, titulo, mensaje, link_url, metadata)
      VALUES (
        v_client_profile_id,
        'obligacion_proxima',
        CASE NEW.status
          WHEN 'lista_revisar' THEN 'Declaración lista para revisión'
          WHEN 'presentada' THEN 'Declaración presentada ante la DIAN'
          WHEN 'pagada' THEN 'Impuesto pagado exitosamente'
          WHEN 'pendiente_info' THEN 'Se requiere información de tu parte'
          ELSE 'Actualización en tu declaración'
        END,
        NEW.tipo_impuesto || ' - Periodo ' ||
          COALESCE(NEW.periodo_mes::TEXT || '/', '') ||
          NEW.periodo_año::TEXT,
        '/declaraciones',
        jsonb_build_object(
          'declaration_id', NEW.id,
          'tipo', NEW.tipo_impuesto,
          'status', NEW.status
        )
      );
    END IF;

    -- Notificar al contador si el cliente subió info (futuro)
    IF NEW.contador_id IS NOT NULL AND NEW.status = 'en_proceso' AND OLD.status = 'pendiente_info' THEN
      INSERT INTO notifications (user_id, tipo, titulo, mensaje, link_url, metadata)
      VALUES (
        NEW.contador_id,
        'documento_subido',
        'Declaración lista para procesar',
        v_client_name || ' · ' || NEW.tipo_impuesto,
        '/declaraciones',
        jsonb_build_object('declaration_id', NEW.id)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER declarations_notify_status
  AFTER UPDATE ON declarations
  FOR EACH ROW EXECUTE FUNCTION notify_declaration_status_change();

-- ─── RLS: declarations ────────────────────────────────────────────────────

ALTER TABLE declarations ENABLE ROW LEVEL SECURITY;
ALTER TABLE declaration_history ENABLE ROW LEVEL SECURITY;

-- Administradores: acceso total
CREATE POLICY "declarations_admin" ON declarations
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'administrador')
  );

-- Contadores: ven las declaraciones de sus clientes
CREATE POLICY "declarations_contador_select" ON declarations
  FOR SELECT TO authenticated
  USING (
    contador_id = auth.uid()
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM clients c WHERE c.id = declarations.client_id AND c.contador_id = auth.uid()
    )
  );

CREATE POLICY "declarations_contador_write" ON declarations
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('contador', 'administrador'))
  );

CREATE POLICY "declarations_contador_update" ON declarations
  FOR UPDATE TO authenticated
  USING (
    contador_id = auth.uid()
    OR EXISTS (SELECT 1 FROM clients c WHERE c.id = declarations.client_id AND c.contador_id = auth.uid())
  );

-- Clientes: solo ven sus propias declaraciones
CREATE POLICY "declarations_cliente_select" ON declarations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM clients c
      JOIN profiles p ON p.id = auth.uid()
      WHERE c.id = declarations.client_id
        AND c.email = (SELECT email FROM profiles WHERE id = auth.uid())
        AND p.role = 'cliente'
    )
  );

-- Historial: igual que declarations
CREATE POLICY "decl_history_admin" ON declaration_history
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'administrador'));

CREATE POLICY "decl_history_contador" ON declaration_history
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM declarations d
      JOIN clients c ON c.id = d.client_id
      WHERE d.id = declaration_history.declaration_id
        AND (c.contador_id = auth.uid() OR d.created_by = auth.uid())
    )
  );

CREATE POLICY "decl_history_cliente" ON declaration_history
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM declarations d
      JOIN clients c ON c.id = d.client_id
      JOIN profiles p ON p.id = auth.uid()
      WHERE d.id = declaration_history.declaration_id
        AND c.email = (SELECT email FROM profiles WHERE id = auth.uid())
        AND p.role = 'cliente'
    )
  );
