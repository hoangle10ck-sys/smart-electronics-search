param(
  [string]$OutputFile = "price-research-batch-retail-refresh-2026-11-17.json"
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Net.Http
$seedDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$outputPath = Join-Path $seedDirectory $OutputFile
$httpClient = New-Object System.Net.Http.HttpClient
$httpClient.Timeout = [TimeSpan]::FromSeconds(30)
$httpClient.DefaultRequestHeaders.UserAgent.ParseAdd('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36')

function Get-JsonLdProducts($node) {
  $found = New-Object System.Collections.Generic.List[object]
  if ($null -eq $node) { return $found }
  if ($node -is [System.Array]) {
    foreach ($item in $node) { foreach ($product in (Get-JsonLdProducts $item)) { $found.Add($product) } }
    return $found
  }
  if ($node -is [pscustomobject]) {
    $types = @($node.'@type' | ForEach-Object { [string]$_ })
    if ($types -contains 'Product' -and $node.offers) { $found.Add($node) }
    foreach ($property in $node.PSObject.Properties) {
      if ($property.Name -ne 'offers') {
        foreach ($product in (Get-JsonLdProducts $property.Value)) { $found.Add($product) }
      }
    }
  }
  return $found
}

function Get-SellerName([string]$hostName, [string]$fallback) {
  switch -Wildcard ($hostName.ToLowerInvariant()) {
    '*fptshop.com.vn' { return 'FPT Shop' }
    '*hacom.vn' { return 'HACOM' }
    '*tncstore.vn' { return 'TNC Store' }
    '*gearvn.com' { return 'GEARVN' }
    '*phongvu.vn' { return 'Phong Vũ' }
    '*bncamera.com' { return 'BNCamera' }
    '*doloicomputer.vn' { return 'Đỗ Lợi Computer' }
    '*tuongvui.vn' { return 'Tường Vui' }
    '*mediamart.vn' { return 'MediaMart' }
    '*agtek.vn' { return 'AGTEK' }
    '*imax.com.vn' { return 'iMax' }
    '*tuanlocstore.vn' { return 'Tuấn Lộc Store' }
    '*store.sony.com.vn' { return 'Sony Store Online' }
    '*kindlesaigon.vn' { return 'Kindle Saigon' }
    '*logico.com.vn' { return 'LOGICO' }
    '*8matter.com' { return '8MATTER' }
    default { return $fallback }
  }
}

$candidateRows = New-Object System.Collections.Generic.List[object]
foreach ($file in (Get-ChildItem -LiteralPath $seedDirectory -Filter 'price-research-batch-*.json' | Where-Object { $_.Name -notmatch 'chotot' -and $_.Name -notmatch 'retail-refresh' })) {
  $batch = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
  foreach ($row in $batch.offers) {
    $sellerName = [string]$row.sellerName
    if (-not $sellerName) { $sellerName = [string]$batch.sellerName }
    $candidateRows.Add([pscustomobject]@{ Row=$row; Seller=$sellerName; BatchFile=$file.Name })
  }
}

$freshRows = New-Object System.Collections.Generic.List[object]
$unmatched = New-Object System.Collections.Generic.List[object]
$index = 0
foreach ($candidate in $candidateRows) {
  $row = $candidate.Row
  $sellerName = $candidate.Seller
  $index++
  try {
    $html = $httpClient.GetStringAsync([string]$row.productUrl).GetAwaiter().GetResult()
    $scripts = [regex]::Matches($html, '<script[^>]*type="application/ld\+json"[^>]*>([\s\S]*?)</script>', [Text.RegularExpressions.RegexOptions]::IgnoreCase)
    $products = New-Object System.Collections.Generic.List[object]
    foreach ($script in $scripts) {
      try {
        $jsonNode = $script.Groups[1].Value | ConvertFrom-Json
        foreach ($product in (Get-JsonLdProducts $jsonNode)) { $products.Add($product) }
      } catch { }
    }
    $offers = New-Object System.Collections.Generic.List[object]
    foreach ($product in $products) {
      $offerNodes = @($product.offers)
      foreach ($offerNode in $offerNodes) {
        foreach ($offer in @($offerNode)) {
          if ($offer -is [pscustomobject] -and [decimal]$offer.price -gt 0) {
            $offerSku = [string]$product.sku
            if ($row.sku -and $offerSku -and [string]$row.sku -ne $offerSku) { continue }
            if ($row.sku -and -not $offerSku -and ([string]$row.productUrl -notmatch "(?i)(sku|$([regex]::Escape([string]$row.sku)))")) { continue }
            $offers.Add([pscustomobject]@{
              ProductName = [string]$product.name
              ProductSku = $offerSku
              Price = [decimal]$offer.price
              Currency = [string]$offer.priceCurrency
              Availability = [string]$offer.availability
              ValidUntil = [string]$offer.priceValidUntil
              ProductUrl = [string]$product.url
            })
          }
        }
      }
    }
    $usable = @($offers | Where-Object { (-not $_.Currency -or $_.Currency -eq 'VND') -and (-not $_.ValidUntil -or [DateTime]$_.ValidUntil -ge [DateTime]::UtcNow.Date) })
    if ($usable.Count -eq 0) {
      $unmatched.Add([pscustomobject]@{ brand=$row.brand; model=$row.model; sellerName=$sellerName; productUrl=$row.productUrl; reason='No current VND price found in the product page structured data.' })
      continue
    }
    $selected = $usable[0]
    $retrievedAt = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
    $sku = [string]$row.sku
    $evidence = "Current structured product offer for $($row.brand) $($row.model), variant '$($row.variantLabel)', on $($row.productUrl). Seller page identifies '$($selected.ProductName)' and showed $([decimal]$selected.Price) VND at $retrievedAt."
    if ($sku) { $evidence += " Product SKU $sku." }
    if ($selected.Availability) { $evidence += " Availability value: $($selected.Availability)." }
    $freshRow = [ordered]@{
      brand = [string]$row.brand
      category = [string]$row.category
      model = [string]$row.model
      sellerName = $sellerName
      variantLabel = [string]$row.variantLabel
      price = [long][Math]::Round([double]$selected.Price)
      productUrl = [string]$row.productUrl
      availability = if ($selected.Availability -match 'InStock') { 'in_stock' } elseif ($selected.Availability -match 'OutOfStock') { 'out_of_stock' } else { 'listed; stock status unknown' }
      evidence = $evidence
      retrievedAt = $retrievedAt
    }
    if ($sku) { $freshRow.sku = $sku }
    if ($null -ne $row.storageGb -and [int]$row.storageGb -gt 0) { $freshRow.storageGb = [int]$row.storageGb }
    $freshRows.Add([pscustomobject]$freshRow)
    Write-Output ("OK {0}/{1} {2} {3} {4:N0} VND ({5})" -f $index, $candidateRows.Count, $row.model, $sellerName, [long]$selected.Price, $row.productUrl)
  } catch {
    $unmatched.Add([pscustomobject]@{ brand=$row.brand; model=$row.model; sellerName=$sellerName; productUrl=$row.productUrl; reason=$_.Exception.Message })
  }
}

$deduplicated = New-Object System.Collections.Generic.List[object]
$seen = @{}
foreach ($row in $freshRows) {
  $key = "$($row.brand.ToLowerInvariant())|$($row.model.ToLowerInvariant())|$($row.storageGb)"
  if (-not $seen.ContainsKey($key)) { $seen[$key] = $row; $deduplicated.Add($row) }
}
$result = [pscustomobject]@{
  batchId = 'retail-price-refresh-2026-11-17'
  researchedAt = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
  source = 'web-research'
  sellerName = 'Mixed approved Vietnamese retailers'
  currency = 'VND'
  offers = @($deduplicated.ToArray())
}
[System.IO.File]::WriteAllText($outputPath, (ConvertTo-Json -InputObject $result -Depth 30), (New-Object System.Text.UTF8Encoding($false)))
$unmatchedPath = [System.IO.Path]::ChangeExtension($outputPath, '.unmatched.json')
[System.IO.File]::WriteAllText($unmatchedPath, (ConvertTo-Json -InputObject @($unmatched.ToArray()) -Depth 10), (New-Object System.Text.UTF8Encoding($false)))
Write-Output ("Wrote {0} retailer prices to {1}; {2} need manual research ({3})." -f $deduplicated.Count, $outputPath, $unmatched.Count, $unmatchedPath)
