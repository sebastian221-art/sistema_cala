# ═══════════════════════════════════════════════════════════
# LIMPIEZA SISTEMA CALA — deja solo las 3 páginas propias
# Ejecutar desde la raíz del proyecto: .\limpiar.ps1
# ═══════════════════════════════════════════════════════════

Write-Host "`n=== LIMPIEZA SISTEMA CALA ===" -ForegroundColor Cyan
Write-Host "IMPORTANTE: primero reemplaza los 5 archivos limpios`n" -ForegroundColor Yellow

function Borrar($ruta) {
    if (Test-Path $ruta) {
        Remove-Item -Recurse -Force $ruta
        Write-Host "  [x] $ruta" -ForegroundColor Red
    }
}

Write-Host "--- Páginas (dashboard) ---" -ForegroundColor Cyan
Borrar "src\app\(dashboard)\calendario"
Borrar "src\app\(dashboard)\chatbot"
Borrar "src\app\(dashboard)\clientes"
Borrar "src\app\(dashboard)\configuracion"
Borrar "src\app\(dashboard)\declaraciones"
Borrar "src\app\(dashboard)\recordatorios"
Borrar "src\app\(dashboard)\reportes"
Borrar "src\app\(dashboard)\tareas"

Write-Host "`n--- APIs muertas ---" -ForegroundColor Cyan
Borrar "src\app\api\admin"
Borrar "src\app\api\ai"
Borrar "src\app\api\chat"
Borrar "src\app\api\clients"
Borrar "src\app\api\contadores"
Borrar "src\app\api\cron"
Borrar "src\app\api\declarations"
Borrar "src\app\api\notifications"
Borrar "src\app\api\reminder-configs"
Borrar "src\app\api\reminders"
Borrar "src\app\api\rut"
Borrar "src\app\api\tasks"
Borrar "src\app\api\webhooks"

Write-Host "`n--- Componentes muertos ---" -ForegroundColor Cyan
Borrar "src\components\ai"
Borrar "src\components\chatbot"
Borrar "src\components\clients"
Borrar "src\components\dashboard"
Borrar "src\components\declarations"
Borrar "src\components\financial"
Borrar "src\components\reports"
Borrar "src\components\tasks"
Borrar "src\components\tax"
Borrar "src\components\layout\NotificationBell.tsx"

Write-Host "`n--- Librerías muertas ---" -ForegroundColor Cyan
Borrar "src\lib\excel-parser"
Borrar "src\lib\pdf-export.ts"
Borrar "src\lib\rut-parser"
Borrar "src\lib\whatsapp"
Borrar "src\hooks\useClients.ts"

Write-Host "`n--- Archivos DUPLICADOS (peligrosos) ---" -ForegroundColor Cyan
Borrar "src\lib\motor-contable\calcularSimilitud.ts"
Borrar "src\lib\motor-contable\generarPerfil.ts"

Write-Host "`n--- Basura del root (¡datos de cliente!) ---" -ForegroundColor Cyan
Borrar "BOLETIN CALA ASOCIADOS 2026 (5).pdf"
Borrar "BOLETIN CALA ASOCIADOS 2026 (5).xlsx"
Borrar "ESF ENERO.xlsx"
Borrar "cala_completo8 (1).png"

Write-Host "`n=== LIMPIEZA COMPLETA ===" -ForegroundColor Green
Write-Host "Ahora corre:" -ForegroundColor Yellow
Write-Host "  npm run build    (verifica que no queden imports rotos)" -ForegroundColor White
Write-Host "  npm run dev`n" -ForegroundColor White