-- Agregar columna visible_to_client a client_documents
-- El contador controla si el cliente puede ver cada documento

ALTER TABLE client_documents
  ADD COLUMN IF NOT EXISTS visible_to_client BOOLEAN NOT NULL DEFAULT FALSE;

-- Los clientes solo pueden ver documentos marcados como visibles
DROP POLICY IF EXISTS "Clients can view their documents" ON client_documents;

CREATE POLICY "Clients can view their documents"
  ON client_documents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM clients
      WHERE clients.id = client_documents.client_id
        AND clients.profile_id = auth.uid()
    )
    AND visible_to_client = TRUE
  );
