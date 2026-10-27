// src/app/(dashboard)/esf-molde/page.tsx
// ESF por molde: la contadora sube su ESF histórico una vez; cada mes solo
// sube el balance y el sistema agrega la columna nueva copiando su estructura.
import { EsfMoldePanel } from '@/components/esf-molde/EsfMoldePanel'

export default function EsfMoldePage() {
  return <EsfMoldePanel />
}
