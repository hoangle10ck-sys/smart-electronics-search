$ErrorActionPreference = 'Stop'
Push-Location -LiteralPath $PSScriptRoot

function Invoke-LocalNpmScript {
  param(
    [Parameter(Mandatory = $true)][string]$ScriptName,
    [Parameter()][string[]]$ScriptArguments = @()
  )

  & npm run $ScriptName -- @ScriptArguments
  if ($LASTEXITCODE -ne 0) {
    throw "Local data command failed: npm run $ScriptName"
  }
}

try {
  Invoke-LocalNpmScript 'seed:catalog:local'

  $batches = @(
    'research-pending.json',
    'research-pending-amd-ryzen-5000-desktop.json',
    'research-pending-techapi-gpu-2026-11-11.json',
    'research-pending-intel-arc-b580-visual-review-2026-11-16.json',
    'research-pending-amd-ryzen-pro-4000-desktop.json',
    'research-pending-amd-verified-image-expansion-2026-11-16.json',
    'research-pending-additional-products-2026-11-11.json',
    'research-pending-sony-ps5-visual-review-2026-11-16.json',
    'research-pending-xbox-series-x-visual-review-2026-11-16.json',
    'research-pending-sapphire-rx-9070-xt-visual-review-2026-11-16.json',
    'research-pending-intel-core-ultra-200s.json',
    'research-pending-intel-core-ultra-200s-mobile.json',
    'research-pending-intel-core-ultra-2026.json',
    'research-pending-intel-core-ultra-roster-completion.json',
    'research-pending-smartphone-brands-2026-11-16.json',
    'research-pending-keychron-k8-2026-11-17.json',
    'research-pending-tplink-archer-be9700-2026-11-17.json',
    'research-pending-anker-521-2026-11-17.json',
    'research-pending-kingston-fury-impact-ddr5-2026-11-17.json'
  )
  foreach ($batch in $batches) {
    Invoke-LocalNpmScript 'import:research:local' @($batch)
  }

  $promotions = @(
    @{ file = 'research-pending.json'; key = 'web-research:meta:quest-3' },
    @{ file = 'research-pending.json'; key = 'web-research:dji:mini-4-pro' },
    @{ file = 'research-pending.json'; key = 'web-research:shure:sm7b' },
    @{ file = 'research-pending-amd-ryzen-5000-desktop.json'; key = 'web-research:amd:ryzen-9-5950x' },
    @{ file = 'research-pending-amd-ryzen-5000-desktop.json'; key = 'web-research:amd:ryzen-9-5900x' },
    @{ file = 'research-pending-amd-ryzen-5000-desktop.json'; key = 'web-research:amd:ryzen-7-5800x3d' },
    @{ file = 'research-pending-amd-ryzen-5000-desktop.json'; key = 'web-research:amd:ryzen-7-5800x' },
    @{ file = 'research-pending-amd-ryzen-5000-desktop.json'; key = 'web-research:amd:ryzen-7-5700x' },
    @{ file = 'research-pending-amd-ryzen-5000-desktop.json'; key = 'web-research:amd:ryzen-5-5600g' },
    @{ file = 'research-pending-amd-ryzen-pro-4000-desktop.json'; key = 'web-research:amd:ryzen-7-pro-4750g' },
    @{ file = 'research-pending-amd-verified-image-expansion-2026-11-16.json'; key = 'web-research:amd:ryzen-9-7900x' },
    @{ file = 'research-pending-amd-verified-image-expansion-2026-11-16.json'; key = 'web-research:amd:ryzen-7-7800x3d' },
    @{ file = 'research-pending-amd-verified-image-expansion-2026-11-16.json'; key = 'web-research:amd:ryzen-5-7600' },
    @{ file = 'research-pending-amd-verified-image-expansion-2026-11-16.json'; key = 'web-research:amd:ryzen-9-9950x' },
    @{ file = 'research-pending-intel-arc-b580-visual-review-2026-11-16.json'; key = 'web-research:techapi:gpu:arc-b580' },
    @{ file = 'research-pending-sony-ps5-visual-review-2026-11-16.json'; key = 'web-research:sony:ps5-slim-cfi-2118-a01' },
    @{ file = 'research-pending-xbox-series-x-visual-review-2026-11-16.json'; key = 'web-research:microsoft:xbox-series-x' },
    @{ file = 'research-pending-sapphire-rx-9070-xt-visual-review-2026-11-16.json'; key = 'web-research:sapphire:pulse-radeon-rx-9070-xt-16g' },
    @{ file = 'research-pending-smartphone-brands-2026-11-16.json'; key = 'web-research:xiaomi:xiaomi-15' },
    @{ file = 'research-pending-smartphone-brands-2026-11-16.json'; key = 'web-research:oppo:find-x9' },
    @{ file = 'research-pending-smartphone-brands-2026-11-16.json'; key = 'web-research:oneplus:oneplus-15' },
    @{ file = 'research-pending-smartphone-brands-2026-11-16.json'; key = 'web-research:honor:400-pro-china-dnp-an00' },
    @{ file = 'research-pending-keychron-k8-2026-11-17.json'; key = 'web-research:keychron:k8-non-backlight' },
    @{ file = 'research-pending-tplink-archer-be9700-2026-11-17.json'; key = 'web-research:tp-link:archer-be9700' },
    @{ file = 'research-pending-anker-521-2026-11-17.json'; key = 'web-research:anker:521-power-bank-a1626' },
    @{ file = 'research-pending-kingston-fury-impact-ddr5-2026-11-17.json'; key = 'web-research:kingston:fury-impact-ddr5-kf556s40ibk2-64' }
  )
  foreach ($promotion in $promotions) {
    Invoke-LocalNpmScript 'promote:research:local' @("--file=$($promotion.file)", $promotion.key)
  }

  $priceBatchPath = Join-Path $PSScriptRoot 'src/seed/price-research-batch-smartphone-brands-2026-11-16.json'
  $priceBatch = Get-Content -LiteralPath $priceBatchPath -Raw | ConvertFrom-Json
  $priceResearchTime = [DateTimeOffset]::Parse($priceBatch.researchedAt)
  $priceAge = [DateTimeOffset]::UtcNow - $priceResearchTime
  if ($priceAge.TotalMinutes -ge -5 -and $priceAge -le [TimeSpan]::FromHours(24)) {
    Invoke-LocalNpmScript 'import:prices:local' @('--batch-file=price-research-batch-smartphone-brands-2026-11-16.json', '--apply')
  } else {
    Write-Host 'Skipping smartphone prices because this source snapshot is older than 24 hours; recheck retailer pages before importing.'
  }

  Invoke-LocalNpmScript 'catalog:repair:local-readiness'
} finally {
  Pop-Location
}
