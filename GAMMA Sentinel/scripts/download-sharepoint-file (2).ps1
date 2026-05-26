# Download helper for SharePoint files using PnP.PowerShell
param(
    [string]$SiteUrl = "https://tecnoaccionsa.sharepoint.com/sites/GAMMA.2024",
    [Parameter(Mandatory=$true)]
    [string]$ServerRelativeUrl,
    [string]$DestinationPath = "C:\Users\AlexisAfonso\OneDrive - Tecno Accion S.A\Documentos\Proyecto\GAMMA Sentinel\knowledge\files",
    [string]$FileName
)

# Ensure TLS1.2
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Ensure-Module {
    param($Name)
    if (-not (Get-Module -ListAvailable -Name $Name)) {
        Write-Host "Instalando módulo $Name..."
        Install-Module -Name $Name -Scope CurrentUser -Force -AllowClobber
    }
    Import-Module $Name -Force
}

Ensure-Module -Name PnP.PowerShell

Write-Host "Conectando a $SiteUrl (se abrirá el navegador para autenticación)..."
Connect-PnPOnline -Url $SiteUrl -Interactive

if (-not $FileName) {
    $FileName = Split-Path -Leaf $ServerRelativeUrl
}

Write-Host "Descargando $ServerRelativeUrl -> $DestinationPath\$FileName"
Get-PnPFile -Url $ServerRelativeUrl -Path $DestinationPath -FileName $FileName -AsFile -Force

if ($?) { Write-Host "Descarga completada." } else { Write-Host "Error en la descarga." }

<# Usage examples:
.
# Ejecutar interactivo: (ajusta ServerRelativeUrl)
# pwsh -File .\scripts\download-sharepoint-file.ps1 -ServerRelativeUrl "/sites/GAMMA.2024/Shared Documents/Carpeta/Archivo.xlsx"
#
# Si quieres usar PowerShell 5.1, ejecuta el script desde PowerShell; usa pwsh para PowerShell 7.
#>
