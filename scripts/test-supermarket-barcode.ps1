param(
    [string]$Barcode = '7290002114109',
    [string[]]$Cities = @('חולון', 'ראשון לציון'),
    [switch]$UseSessionHeaders,
    [switch]$VisibleToken,
    [string]$OutputPath = (Join-Path (Get-Location) ("supermarket-report-{0}.json" -f (Get-Date -Format 'yyyyMMdd-HHmmss')))
)

$ErrorActionPreference = 'Stop'
if ($Barcode -notmatch '^\d{6,14}$') { throw 'Barcode must contain 6 to 14 digits.' }

# Paste your API token between the quotes. Do not commit or share this file afterward.
$ApiToken = '15f439c2-faf3-49c2-bf90-89fa9a040d59'
$credential = $null
$secureToken = $null
if ($UseSessionHeaders) {
    $sessionHeaders = Get-Variable -Name headers -Scope 1 -ValueOnly -ErrorAction SilentlyContinue
    if (-not $sessionHeaders -or -not $sessionHeaders.Authorization) { throw 'No Authorization header found in the calling PowerShell session.' }
    $token = ([string]$sessionHeaders.Authorization).Trim()
} elseif ($ApiToken.Trim()) {
    $token = $ApiToken.Trim()
} elseif ($VisibleToken) {
    $token = (Read-Host 'Paste the actual API token (input will be visible)').Trim()
} else {
    $secureToken = Read-Host 'Enter your Open Israeli Supermarkets API token' -AsSecureString
    $credential = [System.Management.Automation.PSCredential]::new('token', $secureToken)
    $token = $credential.GetNetworkCredential().Password.Trim()
}
$token = $token -replace '^(?i:Bearer)\s+', ''
if ([string]::IsNullOrWhiteSpace($token)) { throw 'A token is required.' }
if ($token.Length -lt 10 -or $token -match '[^\x21-\x7e]') { throw 'The supplied token is too short or contains invalid characters. Paste the actual API token, not the masked input indicator.' }
$headers = @{ Authorization = "Bearer $token" }
$base = 'https://data.openisraelisupermarkets.co.il'

function Get-ApiResult([string]$Url) {
    try {
        $data = Invoke-RestMethod -Uri $Url -Headers $headers -TimeoutSec 30
        return @{ ok = $true; data = $data }
    } catch {
        $status = $null
        if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
        $contentType = $null
        $server = $null
        if ($_.Exception.Response) {
            try { $contentType = [string]$_.Exception.Response.Content.Headers.ContentType } catch { }
            try { $server = [string]($_.Exception.Response.Headers.Server -join ' ') } catch { }
        }
        $detail = $null
        # Retain only short, text error fields and redact credentials before saving.
        try {
            $body = $_.ErrorDetails.Message | ConvertFrom-Json -ErrorAction Stop
            if ($body.detail -is [string]) { $detail = $body.detail }
            elseif ($body.message -is [string]) { $detail = $body.message }
        } catch { }
        if ($detail) {
            $detail = $detail.Replace($token, '[redacted]') -replace '[\r\n\x00-\x1f]', ' '
            $detail = $detail -replace '(?i)bearer\s+\S+', 'Bearer [redacted]'
            $detail = $detail -replace '\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', '[redacted]'
            if ($detail.Length -gt 300) { $detail = $detail.Substring(0, 300) }
        }
        return @{ ok = $false; status = $status; contentType = $contentType; server = $server; error = $(if ($detail) { $detail } else { 'Request failed; see HTTP status.' }) }
    }
}

try {
    Write-Host 'Looking up product and chains...'
    $product = Get-ApiResult "$base/products/barcode/$Barcode"
    $chains = Get-ApiResult "$base/chains/"
    $stores = @{ ok = $false; error = 'Skipped: product ID was not returned.' }
    if ($product.ok -and $product.data.product.id) {
        $productId = [uri]::EscapeDataString([string]$product.data.product.id)
        Write-Host 'Looking up stores...'
        $stores = Get-ApiResult "$base/stores/?product_id=$productId"
    }
    Write-Host 'Looking up current and historical prices...'
    $current = Get-ApiResult "$base/analytics/price-comparison/cross-chain/$Barcode`?current_only=true"
    $historical = Get-ApiResult "$base/analytics/price-comparison/cross-chain/$Barcode`?current_only=false"

    $chainNames = @{}
    if ($chains.ok) {
        foreach ($entry in $chains.data.chains) {
            $chain = if ($entry.chain) { $entry.chain } else { $entry }
            if ($chain.id) { $chainNames[[string]$chain.id] = $chain }
        }
    }
    $storeSummary = @()
    if ($stores.ok) {
        $storeSummary = @($stores.data.stores | Where-Object { $_.address.city -and $_.address.city.Trim() -in $Cities } | ForEach-Object {
            $chain = $chainNames[[string]$_.chainId]
            [pscustomobject]@{
                chainId = $_.chainId; chainName = $chain.chainName; storeId = $_.id
                storeNumber = $_.storeNumber; storeName = $_.storeName
                city = $_.address.city; address = $_.address.storeAddress; lastObservedAt = $_.lastObservedAt
            }
        })
    }
    function Get-FilteredPrices($result) {
        if (-not $result.ok) { return $result }
        $matches = @(
            foreach ($chain in $result.data.chainComparison) {
                foreach ($price in $chain.storePrices) {
                    if ($price.city -and $price.city.Trim() -in $Cities) {
                        [pscustomobject]@{
                            chainName = $chain.chainName; chainId = $chain.chainId; chainCode = $chain.chainCode
                            storeId = $price.storeId; storeName = $price.storeName; storeNumber = $price.storeNumber
                            city = $price.city; totalPrice = $price.totalPrice; unitPrice = $price.unitPrice
                            isOnSale = $price.isOnSale; lastUpdated = $price.lastUpdated; isCurrent = $price.isCurrent
                        }
                    }
                }
            }
        )
        return @{ ok = $true; prices = $matches }
    }
    $filteredCurrent = Get-FilteredPrices $current
    $filteredHistorical = Get-FilteredPrices $historical
    $report = [ordered]@{
        generatedAt = (Get-Date).ToUniversalTime().ToString('o')
        barcode = $Barcode
        cities = $Cities
        tokenDiagnostics = @{
            length = $token.Length
            containsWhitespace = [bool]($token -match '\s')
            containsNonAscii = [bool]($token -match '[^\x21-\x7e]')
            looksLikeJwt = [bool]($token -match '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$')
        }
        product = $product
        chains = @{ ok = $chains.ok; status = $chains.status; error = $chains.error }
        stores = @{ ok = $stores.ok; status = $stores.status; error = $stores.error }
        storeSummary = $storeSummary
        currentPrices = $filteredCurrent
        historicalPrices = $filteredHistorical
    }
    $report | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $OutputPath -Encoding utf8
    if ($storeSummary.Count) { $storeSummary | Format-Table chainName, storeName, storeNumber, city, lastObservedAt -AutoSize }
    else { Write-Host 'No matching stores returned in the selected cities.' }
    if ($filteredCurrent.ok -and $filteredCurrent.prices.Count) { Write-Host 'Current prices:'; $filteredCurrent.prices | Format-Table chainName, storeName, city, unitPrice, lastUpdated -AutoSize }
    if ($filteredHistorical.ok -and $filteredHistorical.prices.Count) { Write-Host 'Historical price results (check isCurrent and lastUpdated):'; $filteredHistorical.prices | Format-Table chainName, storeName, city, unitPrice, isCurrent, lastUpdated -AutoSize }
    foreach ($entry in @(@{ name = 'Product'; result = $product }, @{ name = 'Chains'; result = $chains }, @{ name = 'Stores'; result = $stores }, @{ name = 'Current prices'; result = $current }, @{ name = 'Historical prices'; result = $historical })) {
        if ($entry.result.ok) { Write-Host "$($entry.name): OK" }
        else { Write-Host "$($entry.name): unavailable (HTTP $($entry.result.status)) - $($entry.result.error)" }
    }
    Write-Host "Report saved to: $OutputPath"
    Write-Host 'Store records and historical prices do not guarantee current stock or current prices.'
} finally {
    $headers.Remove('Authorization')
    $token = $null
    $credential = $null
    $secureToken = $null
    $ApiToken = $null
}
