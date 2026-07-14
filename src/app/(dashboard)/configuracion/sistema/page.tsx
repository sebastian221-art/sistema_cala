'use client'

// Página: Estado del sistema y configuración de variables de entorno
import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, CheckCircle, XCircle, AlertCircle, Play, Loader2,
  RefreshCw, Server, Database, MessageSquare, Bot, Clock, Info, Copy, Wrench,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const TRIGGER_SQL = `CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, nombre, apellido, role, activo)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'nombre', 'Usuario'),
    COALESCE(NEW.raw_user_meta_data->>'apellido', ''),
    CASE
      WHEN NEW.raw_user_meta_data->>'role' IN ('administrador', 'contador', 'cliente')
        THEN (NEW.raw_user_meta_data->>'role')::user_role
      ELSE 'cliente'::user_role
    END,
    true
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    nombre = EXCLUDED.nombre,
    apellido = EXCLUDED.apellido,
    role = EXCLUDED.role;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user error: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recrear el trigger (por si acaso)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();`

const DOCUMENTS_SQL = `-- Tabla de gestión documental por cliente
CREATE TABLE IF NOT EXISTS public.client_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES profiles(id),
  nombre TEXT NOT NULL,
  categoria TEXT NOT NULL DEFAULT 'otro',
  descripcion TEXT,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER,
  file_type TEXT,
  storage_path TEXT,
  periodo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_documents_client_id ON client_documents(client_id);

ALTER TABLE client_documents ENABLE ROW LEVEL SECURITY;

-- RLS: administradores y contadores pueden ver/subir; clientes solo ven sus propios
CREATE POLICY "Ver documentos" ON client_documents
  FOR SELECT USING (
    get_user_role() = 'administrador'
    OR (get_user_role() = 'contador' AND EXISTS (
      SELECT 1 FROM clients WHERE clients.id = client_documents.client_id
        AND clients.contador_id = auth.uid()
    ))
  );

CREATE POLICY "Insertar documentos" ON client_documents
  FOR INSERT WITH CHECK (
    get_user_role() IN ('administrador', 'contador')
    AND uploaded_by = auth.uid()
  );

CREATE POLICY "Eliminar documentos" ON client_documents
  FOR DELETE USING (
    get_user_role() = 'administrador'
    OR (get_user_role() = 'contador' AND uploaded_by = auth.uid())
  );`

const RST_ENUM_SQL = `-- Extender el enum tipo_impuesto para incluir RST
-- Ejecutar ANTES de importar el calendario 2026
ALTER TYPE tipo_impuesto ADD VALUE IF NOT EXISTS 'RST_ANUAL';
ALTER TYPE tipo_impuesto ADD VALUE IF NOT EXISTS 'RST_MENSUAL';`

const MESSAGES_SQL = `-- Paso 1: Agregar columna profile_id a clients (vincula cliente con su usuario)
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_clients_profile_id ON clients(profile_id);

-- Paso 2: Tabla de mensajes internos cliente-contador
CREATE TABLE IF NOT EXISTS public.client_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES profiles(id),
  content TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_messages_client_id ON client_messages(client_id);
CREATE INDEX IF NOT EXISTS idx_client_messages_created_at ON client_messages(created_at);

ALTER TABLE client_messages ENABLE ROW LEVEL SECURITY;

-- RLS: admin ve todo; contador ve sus clientes; cliente ve el suyo (via profile_id)
CREATE POLICY "Ver mensajes propios" ON client_messages
  FOR SELECT USING (
    get_user_role() = 'administrador'
    OR sender_id = auth.uid()
    OR (get_user_role() = 'contador' AND EXISTS (
      SELECT 1 FROM clients WHERE clients.id = client_messages.client_id
        AND clients.contador_id = auth.uid()
    ))
    OR (get_user_role() = 'cliente' AND EXISTS (
      SELECT 1 FROM clients WHERE clients.id = client_messages.client_id
        AND clients.profile_id = auth.uid()
    ))
  );

CREATE POLICY "Enviar mensajes" ON client_messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND (
      get_user_role() = 'administrador'
      OR (get_user_role() = 'contador' AND EXISTS (
        SELECT 1 FROM clients WHERE clients.id = client_messages.client_id
          AND clients.contador_id = auth.uid()
      ))
      OR (get_user_role() = 'cliente' AND EXISTS (
        SELECT 1 FROM clients WHERE clients.id = client_messages.client_id
          AND clients.profile_id = auth.uid()
      ))
    )
  );

CREATE POLICY "Marcar como leido" ON client_messages
  FOR UPDATE USING (
    get_user_role() IN ('administrador', 'contador', 'cliente')
  ) WITH CHECK (true);`

interface EnvVar {
  configured: boolean
  value: string | null
  required: boolean
  description: string
  where: string
}

interface SystemStatus {
  vars: Record<string, EnvVar>
  stats: {
    clientes_activos: number
    contadores_activos: number
    recordatorios_pendientes: number
  }
}

interface CronResult {
  fecha: string
  modo: string
  recordatorios_enviados: number
  resumenes_enviados: number
  recordatorios_pendientes: number
  errores: number
  detalle: string[]
}

const VAR_GROUPS = [
  {
    label: 'Supabase (Base de datos)',
    icon: Database,
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-500/10',
    vars: ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'],
  },
  {
    label: 'Inteligencia Artificial (Groq)',
    icon: Bot,
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-500/10',
    vars: ['GROQ_API_KEY'],
  },
  {
    label: 'WhatsApp — Meta Cloud API',
    icon: MessageSquare,
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-500/10',
    vars: ['META_WHATSAPP_TOKEN', 'META_WHATSAPP_PHONE_ID', 'WHATSAPP_VERIFY_TOKEN'],
  },
  {
    label: 'WhatsApp — Twilio (alternativa)',
    icon: MessageSquare,
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-500/10',
    vars: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_NUMBER'],
  },
  {
    label: 'Cron de recordatorios',
    icon: Clock,
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-500/10',
    vars: ['CRON_SECRET'],
  },
]

export default function SistemaPage() {
  const [status, setStatus] = useState<SystemStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [cronRunning, setCronRunning] = useState(false)
  const [cronResult, setCronResult] = useState<CronResult | null>(null)
  const [cronModo, setCronModo] = useState<'test' | 'enviar'>('test')
  const [forzarResumen, setForzarResumen] = useState(false)

  useEffect(() => {
    loadStatus()
  }, [])

  const loadStatus = async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/admin/system/status')
      if (res.ok) {
        const { data } = await res.json()
        setStatus(data)
      }
    } catch {
      toast.error('Error al cargar estado del sistema')
    } finally {
      setIsLoading(false)
    }
  }

  const runCron = async () => {
    setCronRunning(true)
    setCronResult(null)
    try {
      const res = await fetch('/api/admin/cron/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modo: cronModo, forzar_resumen: forzarResumen }),
      })
      const { data, error } = await res.json()
      if (!res.ok) throw new Error(error ?? 'Error al ejecutar')
      setCronResult(data)
      toast.success(
        cronModo === 'enviar'
          ? `Enviados: ${data.recordatorios_enviados} recordatorios, ${data.resumenes_enviados} resúmenes`
          : `Simulación: ${data.recordatorios_pendientes} pendientes encontrados`
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al ejecutar recordatorios')
    } finally {
      setCronRunning(false)
    }
  }

  const totalRequired = status
    ? Object.values(status.vars).filter((v) => v.required).length
    : 0
  const configuredRequired = status
    ? Object.values(status.vars).filter((v) => v.required && v.configured).length
    : 0

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/configuracion"
          className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label="Volver"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Estado del Sistema</h1>
          <p className="text-muted-foreground mt-1">
            Variables de entorno, salud del sistema y ejecución de recordatorios
          </p>
        </div>
        <button
          onClick={loadStatus}
          className="ml-auto p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="Recargar estado"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Resumen de estado */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-foreground">{configuredRequired}/{totalRequired}</p>
          <p className="text-xs text-muted-foreground mt-1">Variables requeridas</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-foreground">{status?.stats.clientes_activos ?? 0}</p>
          <p className="text-xs text-muted-foreground mt-1">Clientes activos</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-foreground">{status?.stats.contadores_activos ?? 0}</p>
          <p className="text-xs text-muted-foreground mt-1">Contadores activos</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-foreground">{status?.stats.recordatorios_pendientes ?? 0}</p>
          <p className="text-xs text-muted-foreground mt-1">Recordatorios pendientes</p>
        </div>
      </div>

      {/* Alerta si faltan variables críticas */}
      {configuredRequired < totalRequired && (
        <div className="flex items-start gap-3 p-4 bg-danger/10 border border-danger/30 rounded-xl">
          <AlertCircle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-sm text-danger">
              Faltan {totalRequired - configuredRequired} variable(s) requerida(s)
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Agrega las variables faltantes en tu archivo{' '}
              <code className="font-mono bg-muted px-1 rounded">.env.local</code> y reinicia el servidor.
              En producción (Vercel), agrégalas en{' '}
              <strong>Project → Settings → Environment Variables</strong>.
            </p>
          </div>
        </div>
      )}

      {/* Variables de entorno por grupo */}
      {VAR_GROUPS.map((group) => {
        const Icon = group.icon
        const groupVars = group.vars.map((key) => ({
          key,
          ...(status?.vars[key] ?? { configured: false, value: null, required: false, description: '', where: '' }),
        }))
        const allConfigured = groupVars.every((v) => v.configured)
        const someRequired = groupVars.some((v) => v.required)

        return (
          <div key={group.label} className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
              <div className={cn('p-2 rounded-lg', group.bgColor)}>
                <Icon className={cn('w-4 h-4', group.color)} />
              </div>
              <h2 className="font-semibold text-foreground text-sm">{group.label}</h2>
              {someRequired && (
                <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-danger/10 text-danger">Requerido</span>
              )}
              {!someRequired && (
                <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Opcional</span>
              )}
            </div>
            <div className="divide-y divide-border">
              {groupVars.map(({ key, configured, value, required, description, where }) => (
                <div key={key} className="flex items-start justify-between px-5 py-4 gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <code className="font-mono text-xs font-semibold text-foreground bg-muted px-1.5 py-0.5 rounded">
                        {key}
                      </code>
                      {required && (
                        <span className="text-xs text-danger font-medium">* requerido</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{description}</p>
                    {configured && value && (
                      <p className="text-xs font-mono text-foreground/60 mt-0.5">{value}</p>
                    )}
                    {!configured && (
                      <p className="text-xs text-warning mt-1 flex items-center gap-1">
                        <Info className="w-3 h-3" />
                        Dónde obtenerla: <span className="font-medium">{where}</span>
                      </p>
                    )}
                  </div>
                  <div className="flex-shrink-0 mt-0.5">
                    {configured ? (
                      <CheckCircle className="w-5 h-5 text-success" aria-label="Configurada" />
                    ) : (
                      <XCircle className={cn('w-5 h-5', required ? 'text-danger' : 'text-muted-foreground')} aria-label="No configurada" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}

      {/* Instrucciones para .env.local */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        <h2 className="font-semibold text-foreground flex items-center gap-2 text-sm">
          <Server className="w-4 h-4 text-primary" />
          Cómo configurar las variables de entorno
        </h2>
        <div className="space-y-2 text-xs text-muted-foreground">
          <p><strong className="text-foreground">Desarrollo local:</strong> Crea o edita el archivo <code className="font-mono bg-muted px-1 rounded">.env.local</code> en la raíz del proyecto:</p>
          <pre className="bg-muted rounded-lg p-3 text-xs font-mono overflow-x-auto text-foreground">{`# .env.local (en la raíz del proyecto)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...
GROQ_API_KEY=gsk_xxxxxxxxxxxx
META_WHATSAPP_TOKEN=EAAxxxxxxxx
META_WHATSAPP_PHONE_ID=123456789
WHATSAPP_VERIFY_TOKEN=mi_token_secreto_2026`}</pre>
          <p className="mt-2">Después de editar <code className="font-mono bg-muted px-1 rounded">.env.local</code>, <strong className="text-foreground">reinicia el servidor</strong> con <code className="font-mono bg-muted px-1 rounded">npm run dev</code>.</p>
          <p><strong className="text-foreground">Producción (Vercel):</strong> Ve a tu proyecto en Vercel → Settings → Environment Variables y agrega cada variable.</p>
        </div>
      </div>

      {/* Reparar trigger de base de datos */}
      <div className="bg-card border border-amber-300/50 dark:border-amber-700/50 rounded-xl overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-amber-300/50 dark:border-amber-700/50 bg-amber-500/5">
          <div className="p-2 rounded-lg bg-amber-500/10">
            <Wrench className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground text-sm">Reparar Trigger de Base de Datos</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Si al crear usuarios aparece &quot;Database error creating new user&quot;, ejecuta este SQL en Supabase
            </p>
          </div>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-xs text-muted-foreground">
            El trigger <code className="font-mono bg-muted px-1 rounded">handle_new_user</code> sincroniza
            los usuarios de Supabase Auth con la tabla <code className="font-mono bg-muted px-1 rounded">profiles</code>.
            Si falla, ningún usuario puede ser creado. Copia el SQL de abajo y ejecútalo en{' '}
            <strong className="text-foreground">Supabase → SQL Editor → New query</strong>:
          </p>
          <div className="relative">
            <pre className="bg-muted rounded-lg p-4 text-xs font-mono overflow-x-auto text-foreground leading-relaxed whitespace-pre">
              {TRIGGER_SQL}
            </pre>
            <button
              onClick={() => {
                navigator.clipboard.writeText(TRIGGER_SQL)
                toast.success('SQL copiado al portapapeles')
              }}
              className="absolute top-2 right-2 flex items-center gap-1.5 px-2 py-1 rounded-lg bg-background/80 border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
              title="Copiar SQL"
            >
              <Copy className="w-3 h-3" />
              Copiar
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Después de ejecutar el SQL, intenta crear el usuario nuevamente desde{' '}
            <Link href="/configuracion/usuarios" className="text-primary underline underline-offset-2">
              Gestión de Usuarios
            </Link>.
          </p>
        </div>
      </div>

      {/* Extender enum RST */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <div className="p-2 rounded-lg bg-orange-500/10">
            <Database className="w-4 h-4 text-orange-600 dark:text-orange-400" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground text-sm">Extender Calendario — RST</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Ejecuta este SQL <strong>antes</strong> de importar el calendario 2026 para habilitar los tipos RST
            </p>
          </div>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-xs text-muted-foreground">
            Copia el SQL y ejecútalo en <strong className="text-foreground">Supabase → SQL Editor → New query</strong>.
            Luego importa el calendario desde Configuración → Sistema.
          </p>
          <div className="relative">
            <pre className="bg-muted rounded-lg p-4 text-xs font-mono overflow-x-auto text-foreground leading-relaxed whitespace-pre max-h-48">
              {RST_ENUM_SQL}
            </pre>
            <button
              onClick={() => {
                navigator.clipboard.writeText(RST_ENUM_SQL)
                toast.success('SQL copiado al portapapeles')
              }}
              className="absolute top-2 right-2 flex items-center gap-1.5 px-2 py-1 rounded-lg bg-background/80 border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
            >
              <Copy className="w-3 h-3" />
              Copiar
            </button>
          </div>
        </div>
      </div>

      {/* Crear tabla de documentos */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <div className="p-2 rounded-lg bg-blue-500/10">
            <Database className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground text-sm">Activar Gestión Documental</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Ejecuta este SQL una sola vez para habilitar el almacenamiento de documentos por cliente
            </p>
          </div>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-xs text-muted-foreground">
            Copia el SQL y ejecútalo en <strong className="text-foreground">Supabase → SQL Editor → New query</strong>.
            Luego crea un bucket llamado <code className="font-mono bg-muted px-1 rounded">documentos</code> en{' '}
            <strong className="text-foreground">Supabase → Storage</strong> (puede ser público o privado).
          </p>
          <div className="relative">
            <pre className="bg-muted rounded-lg p-4 text-xs font-mono overflow-x-auto text-foreground leading-relaxed whitespace-pre max-h-64">
              {DOCUMENTS_SQL}
            </pre>
            <button
              onClick={() => {
                navigator.clipboard.writeText(DOCUMENTS_SQL)
                toast.success('SQL copiado al portapapeles')
              }}
              className="absolute top-2 right-2 flex items-center gap-1.5 px-2 py-1 rounded-lg bg-background/80 border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
            >
              <Copy className="w-3 h-3" />
              Copiar
            </button>
          </div>
        </div>
      </div>

      {/* Panel: Mensajes internos */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <div className="p-2 rounded-lg bg-green-500/10">
            <MessageSquare className="w-4 h-4 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground text-sm">Activar Mensajes Internos</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Ejecuta este SQL para habilitar el canal de comunicación entre cliente y contador
            </p>
          </div>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-xs text-muted-foreground">
            Copia el SQL y ejecútalo en <strong className="text-foreground">Supabase → SQL Editor → New query</strong>.
          </p>
          <div className="relative">
            <pre className="bg-muted rounded-lg p-4 text-xs font-mono overflow-x-auto text-foreground leading-relaxed whitespace-pre max-h-64">
              {MESSAGES_SQL}
            </pre>
            <button
              onClick={() => {
                navigator.clipboard.writeText(MESSAGES_SQL)
                toast.success('SQL copiado al portapapeles')
              }}
              className="absolute top-2 right-2 flex items-center gap-1.5 px-2 py-1 rounded-lg bg-background/80 border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
            >
              <Copy className="w-3 h-3" />
              Copiar
            </button>
          </div>
        </div>
      </div>

      {/* Panel de ejecución de recordatorios */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <div className="p-2 rounded-lg bg-amber-500/10">
            <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground text-sm">Ejecutar Recordatorios Manualmente</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Simula o envía los recordatorios para la fecha de hoy según la configuración activa
            </p>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Opciones */}
          <div className="flex flex-wrap gap-4 items-center">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="modo"
                value="test"
                checked={cronModo === 'test'}
                onChange={() => setCronModo('test')}
                className="w-4 h-4"
              />
              <div>
                <span className="text-sm font-medium text-foreground">Simulación (recomendado)</span>
                <p className="text-xs text-muted-foreground">Muestra qué se enviaría sin enviar nada</p>
              </div>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="modo"
                value="enviar"
                checked={cronModo === 'enviar'}
                onChange={() => setCronModo('enviar')}
                className="w-4 h-4"
              />
              <div>
                <span className="text-sm font-medium text-foreground">Enviar ahora</span>
                <p className="text-xs text-muted-foreground">Envía WhatsApp reales a clientes y contadores</p>
              </div>
            </label>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={forzarResumen}
              onChange={(e) => setForzarResumen(e.target.checked)}
              className="w-4 h-4 rounded border-border"
            />
            <span className="text-sm text-foreground">
              Forzar envío de resumen mensual (normalmente solo se envía el día 1 de cada mes)
            </span>
          </label>

          <button
            onClick={runCron}
            disabled={cronRunning}
            className={cn(
              'flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-colors',
              cronModo === 'enviar'
                ? 'bg-primary text-primary-foreground hover:bg-primary-light'
                : 'bg-muted text-foreground hover:bg-muted/80',
              cronRunning && 'opacity-60 cursor-not-allowed'
            )}
          >
            {cronRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {cronRunning
              ? 'Ejecutando...'
              : cronModo === 'enviar'
              ? 'Enviar recordatorios ahora'
              : 'Simular envío'}
          </button>

          {/* Resultado */}
          {cronResult && (
            <div className="mt-4 rounded-xl border border-border overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3 bg-muted/30 border-b border-border">
                <CheckCircle className="w-4 h-4 text-success" />
                <p className="text-sm font-medium text-foreground">
                  Resultado — {cronResult.fecha} ({cronResult.modo === 'enviar' ? 'Envío real' : 'Simulación'})
                </p>
              </div>
              <div className="px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center border-b border-border">
                <div>
                  <p className="text-xl font-bold text-foreground">{cronResult.recordatorios_pendientes}</p>
                  <p className="text-xs text-muted-foreground">Pendientes</p>
                </div>
                <div>
                  <p className="text-xl font-bold text-success">{cronResult.recordatorios_enviados}</p>
                  <p className="text-xs text-muted-foreground">Enviados</p>
                </div>
                <div>
                  <p className="text-xl font-bold text-primary">{cronResult.resumenes_enviados}</p>
                  <p className="text-xs text-muted-foreground">Resúmenes</p>
                </div>
                <div>
                  <p className="text-xl font-bold text-danger">{cronResult.errores}</p>
                  <p className="text-xs text-muted-foreground">Errores</p>
                </div>
              </div>
              {cronResult.detalle.length > 0 && (
                <div className="px-4 py-3 max-h-48 overflow-y-auto space-y-1">
                  {cronResult.detalle.map((d, i) => (
                    <p key={i} className="text-xs font-mono text-muted-foreground">{d}</p>
                  ))}
                </div>
              )}
              {cronResult.detalle.length === 0 && (
                <div className="px-4 py-3 text-xs text-muted-foreground">
                  No hay recordatorios programados para hoy con la configuración actual.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
