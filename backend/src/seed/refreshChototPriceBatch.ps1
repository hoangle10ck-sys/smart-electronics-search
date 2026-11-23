param(
  [string]$InputFile = "price-research-batch-2026-11-11-chotot.json",
  [string]$OutputFile = "price-research-batch-chotot-refresh-2026-11-17.json"
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Net.Http
$seedDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$inputPath = Join-Path $seedDirectory $InputFile
$outputPath = Join-Path $seedDirectory $OutputFile
$sourceBatch = Get-Content -LiteralPath $inputPath -Raw -Encoding UTF8 | ConvertFrom-Json
$httpClient = New-Object System.Net.Http.HttpClient
$httpClient.Timeout = [TimeSpan]::FromSeconds(25)
$httpClient.DefaultRequestHeaders.UserAgent.ParseAdd('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36')

function Normalize-Text([string]$value) {
  if (-not $value) { return '' }
  $normalized = $value.Normalize([Text.NormalizationForm]::FormD)
  $builder = New-Object Text.StringBuilder
  foreach ($character in $normalized.ToCharArray()) {
    if ([Globalization.CharUnicodeInfo]::GetUnicodeCategory($character) -ne [Globalization.UnicodeCategory]::NonSpacingMark) {
      [void]$builder.Append($character)
    }
  }
  return [regex]::Replace($builder.ToString().ToLowerInvariant(), '[^a-z0-9]+', '')
}

function Get-ModelKey($row) {
  $model = [string]$row.model
  if ($model -match '(?i)^iPhone\s+SE') {
    if ($model -match '2020|2nd generation') { return 'iphonese2020' }
    if ($model -match '3rd generation') { return 'iphonese2022' }
    return 'iphonese'
  }
  if ($model -match '(?i)^iPhone\s+') {
    $base = $model -replace '(?i)^iPhone\s+', ''
    $base = $base -replace '\(.*?\)', ''
    return Normalize-Text ("iphone " + $base.Trim())
  }
  if ($model -match '(?i)^ThinkPad\s+') {
    $match = [regex]::Match($model, '(?i)\b(T\d{3,4}[A-Z]?|X\d{3}|X1\s+Carbon\s+\d+(?:st|nd|rd|th)?\s+Gen)\b')
    if ($match.Success) { return Normalize-Text $match.Value }
  }
  if ($model -match '(?i)^iPad\s+') {
    if ($model -match '(?i)M[1-5]') {
      $chip = [regex]::Match($model, '(?i)M[1-5]').Value
      return Normalize-Text $chip
    }
    if ($model -match '(?i)Pro\s+12\.9') { return 'ipadpro129' }
    if ($model -match '(?i)Pro\s+11') { return 'ipadpro11' }
    if ($model -match '(?i)mini\s+4') { return 'ipadmini4' }
    if ($model -match '(?i)mini\s+\(6th') { return 'ipadmini6' }
    if ($model -match '(?i)Air\s+\(3rd') { return 'ipadair3' }
    if ($model -match '(?i)Air\s+\(4th') { return 'ipadair4' }
    if ($model -match '(?i)Air\s+\(5th') { return 'ipadair5' }
    if ($model -match '(?i)7th generation') { return 'ipadgen7' }
    if ($model -match '(?i)9th generation') { return 'ipadgen9' }
    if ($model -match '(?i)10th generation') { return 'ipadgen10' }
    return Normalize-Text ($model -replace '\([^)]*\)', '')
  }
  if ($model -match '(?i)^MacBook') {
    $chip = [regex]::Match($model, '(?i)\bM[1-5](?:\s+Max|\s+Pro)?\b')
    if ($chip.Success) { return Normalize-Text $chip.Value }
    $year = [regex]::Match($model, '\b20\d{2}\b')
    if ($year.Success) { return Normalize-Text (($model -replace '\([^)]*\)', '') + ' ' + $year.Value) }
    return Normalize-Text ($model -replace '\([^)]*\)', '')
  }
  if ($model -match '(?i)^Surface\s+') { return Normalize-Text $model }
  if ($model -match '(?i)^XPS\s+') {
    $code = [regex]::Match($model, '\b\d{4}\b')
    if ($code.Success) { return 'xps' + $code.Value }
  }
  if ($model -match '(?i)^Pixel\s+') { return Normalize-Text $model }
  if ($model -match '(?i)^Galaxy\s+') { return Normalize-Text ($model -replace '\(.*?\)', '') }
  return Normalize-Text $model
}

function Get-ExpectedCapacity($row) {
  if ($row.category -notin @('phone', 'tablet')) { return $null }
  if ($null -ne $row.storageGb -and [int]$row.storageGb -gt 0) { return [int]$row.storageGb }
  $match = [regex]::Match([string]$row.variantLabel, '(?i)\b(32|64|128|256|512|1024)\s*GB\b')
  if ($match.Success) { return [int]$match.Groups[1].Value }
  return $null
}

function Test-ListingMatch($row, $ad, [string]$modelKey) {
  $subject = [string]$ad.subject
  $paramsText = (($ad.params | ForEach-Object { [string]$_.value }) -join ' ')
  $adKey = Normalize-Text ($subject + ' ' + $paramsText)
  if (-not $modelKey -or -not $adKey.Contains($modelKey)) { return $false }
  $capacity = Get-ExpectedCapacity $row
  if ($capacity) {
    $capacityFound = $false
    foreach ($parameter in $ad.params) {
      if ([string]$parameter.value -match "(?i)(^|\D)$capacity\s*GB(\D|$)") { $capacityFound = $true; break }
    }
    if (-not $capacityFound) { return $false }
  }
  return $true
}

$freshRows = New-Object System.Collections.Generic.List[object]
$unmatched = New-Object System.Collections.Generic.List[object]
$index = 0
foreach ($row in $sourceBatch.offers) {
  $index++
  try {
    $response = $httpClient.GetStringAsync([string]$row.productUrl).GetAwaiter().GetResult()
    $nextDataMatch = [regex]::Match($response, '<script id="__NEXT_DATA__" type="application/json">([\s\S]*?)</script>')
    if (-not $nextDataMatch.Success) { throw 'No server-rendered listing data.' }
    $page = $nextDataMatch.Groups[1].Value | ConvertFrom-Json
    $state = $page.props.initialState
    $ad = $state.adView.adInfo.ad
    $chosenPrice = 0
    $listingId = $null
    $listingText = ''
    $candidateCount = 0
    if ($ad -and [int]$ad.price -gt 0 -and [string]$ad.status -eq 'active') {
      $modelKey = Get-ModelKey $row
      $adKey = Normalize-Text ([string]$ad.subject + ' ' + (($ad.params | ForEach-Object { [string]$_.value }) -join ' '))
      if (Test-ListingMatch $row $ad $modelKey) {
        $chosenPrice = [int]$ad.price
        $listingId = [string]$ad.list_id
        $listingText = [string]$ad.subject
        $candidateCount = 1
      }
    }
    if ($chosenPrice -le 0) {
      $modelKey = Get-ModelKey $row
      $ads = @($state.adlisting.data.ads | Where-Object { [string]$_.status -eq 'active' -and [int]$_.price -gt 0 -and (Test-ListingMatch $row $_ $modelKey) })
      if ($ads.Count -gt 0) {
        $prices = @($ads | ForEach-Object { [int]$_.price } | Sort-Object)
        $chosenPrice = $prices[[int][Math]::Floor($prices.Count / 2)]
        $candidateCount = $ads.Count
        $selectedAd = $ads[[int][Math]::Floor($ads.Count / 2)]
        $listingId = [string]$selectedAd.list_id
        $listingText = [string]$selectedAd.subject
      }
    }
    if ($chosenPrice -le 0) {
      $unmatched.Add([pscustomobject]@{ brand=$row.brand; model=$row.model; category=$row.category; sourceUrl=$row.productUrl; reason='No active listing with a title and capacity that match the researched model.' })
      continue
    }
    $retrievedAt = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
    $freshRow = [ordered]@{
      brand = [string]$row.brand
      category = [string]$row.category
      model = [string]$row.model
      sellerName = 'Chợ Tốt'
      variantLabel = ([string]$row.variantLabel + '; giá thị trường máy đã qua sử dụng')
      price = $chosenPrice
      productUrl = [string]$row.productUrl
      availability = 'active_listing'
      evidence = "Active Chợ Tốt listing matched model '$($row.model)' ($modelKey), variant '$($row.variantLabel)'; $candidateCount matching active listing(s) showed a median/current observed price of $chosenPrice VND. Listing ${listingId}: $listingText. Source page: $($row.productUrl)"
      retrievedAt = $retrievedAt
    }
    if ($null -ne $row.storageGb -and [int]$row.storageGb -gt 0) { $freshRow.storageGb = [int]$row.storageGb }
    $freshRows.Add([pscustomobject]$freshRow)
    Write-Output ("OK {0}/{1} {2} {3} {4:N0} VND ({5} listings)" -f $index, $sourceBatch.offers.Count, $row.model, $row.variantLabel, $chosenPrice, $candidateCount)
  } catch {
    $unmatched.Add([pscustomobject]@{ brand=$row.brand; model=$row.model; category=$row.category; sourceUrl=$row.productUrl; reason=$_.Exception.Message })
  }
}

$batch = [pscustomobject]@{
  batchId = 'chotot-refresh-2026-11-17'
  researchedAt = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
  source = 'web-research'
  sellerName = 'Chợ Tốt'
  currency = 'VND'
  offers = @($freshRows.ToArray())
}
$json = ConvertTo-Json -InputObject $batch -Depth 30
[System.IO.File]::WriteAllText($outputPath, $json, (New-Object System.Text.UTF8Encoding($false)))
$unmatchedPath = [System.IO.Path]::ChangeExtension($outputPath, '.unmatched.json')
[System.IO.File]::WriteAllText($unmatchedPath, (ConvertTo-Json -InputObject @($unmatched.ToArray()) -Depth 10), (New-Object System.Text.UTF8Encoding($false)))

Write-Output ("Wrote {0} verified current listing observations to {1}; {2} rows need manual research ({3})." -f $freshRows.Count, $outputPath, $unmatched.Count, $unmatchedPath)
