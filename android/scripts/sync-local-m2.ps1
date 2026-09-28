# Downloads Google/Maven artifacts into android/local-m2, skipping SSL verification.
$ErrorActionPreference = 'Continue'
Add-Type @"
using System.Net;
using System.Security.Cryptography.X509Certificates;
public class TrustAllCerts : ICertificatePolicy {
  public bool CheckValidationResult(ServicePoint sp, X509Certificate cert, WebRequest req, int problem) { return true; }
}
"@
[System.Net.ServicePointManager]::CertificatePolicy = New-Object TrustAllCerts
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $root 'local-m2'))) {
  $root = Join-Path $PSScriptRoot '..'
}
$m2 = Join-Path $root 'local-m2'

function Save-MavenArtifact {
  param(
    [string]$Group,
    [string]$Artifact,
    [string]$Version,
    [string]$Ext,
    [string[]]$Bases
  )
  $rel = ($Group -replace '\.', '/') + "/$Artifact/$Version"
  $dir = Join-Path $m2 $rel
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $file = Join-Path $dir "$Artifact-$Version.$Ext"
  if ((Test-Path $file) -and ((Get-Item $file).Length -gt 200)) {
    Write-Host "skip $Artifact-$Version.$Ext"
    return $true
  }
  foreach ($base in $Bases) {
    $url = "$base/$rel/$Artifact-$Version.$Ext"
    try {
      Invoke-WebRequest -Uri $url -OutFile $file -UseBasicParsing -TimeoutSec 60
      if ((Get-Item $file).Length -gt 200) {
        Write-Host "ok  $Artifact-$Version.$Ext"
        return $true
      }
    } catch {
      Write-Host "miss $url"
    }
  }
  return $false
}

$google = @(
  'https://dl.google.com/dl/android/maven2',
  'https://maven.google.com'
)
$central = @(
  'https://repo1.maven.org/maven2',
  'https://repo.maven.apache.org/maven2'
)

$gms = @(
  @{ a = 'play-services-location'; v = '21.3.0' },
  @{ a = 'play-services-base'; v = '18.5.0' },
  @{ a = 'play-services-basement'; v = '18.4.0' },
  @{ a = 'play-services-tasks'; v = '18.2.0' },
  @{ a = 'play-services-base'; v = '18.1.0' },
  @{ a = 'play-services-basement'; v = '18.3.0' },
  @{ a = 'play-services-tasks'; v = '18.1.0' }
)
foreach ($item in $gms) {
  [void](Save-MavenArtifact 'com.google.android.gms' $item.a $item.v 'pom' $google)
  [void](Save-MavenArtifact 'com.google.android.gms' $item.a $item.v 'aar' $google)
  [void](Save-MavenArtifact 'com.google.android.gms' $item.a $item.v 'module' $google)
}

$coroutines = @(
  'kotlinx-coroutines-play-services',
  'kotlinx-coroutines-core',
  'kotlinx-coroutines-core-jvm',
  'kotlinx-coroutines-android',
  'kotlinx-coroutines-bom'
)
foreach ($name in $coroutines) {
  foreach ($ver in @('1.9.0', '1.8.1', '1.7.3')) {
    [void](Save-MavenArtifact 'org.jetbrains.kotlinx' $name $ver 'pom' $central)
    if ($name -ne 'kotlinx-coroutines-bom') {
      [void](Save-MavenArtifact 'org.jetbrains.kotlinx' $name $ver 'jar' $central)
    }
    [void](Save-MavenArtifact 'org.jetbrains.kotlinx' $name $ver 'module' $central)
  }
}

[void](Save-MavenArtifact 'com.google.code.gson' 'gson' '2.13.2' 'pom' $central)
[void](Save-MavenArtifact 'com.google.code.gson' 'gson' '2.13.2' 'jar' $central)
[void](Save-MavenArtifact 'com.google.code.gson' 'gson-parent' '2.13.2' 'pom' $central)
[void](Save-MavenArtifact 'com.google.errorprone' 'error_prone_annotations' '2.36.0' 'pom' $central)
[void](Save-MavenArtifact 'com.google.errorprone' 'error_prone_annotations' '2.36.0' 'jar' $central)
[void](Save-MavenArtifact 'io.ionic.libs' 'iongeolocation-android' '2.2.2' 'pom' $central)
[void](Save-MavenArtifact 'io.ionic.libs' 'iongeolocation-android' '2.2.2' 'aar' $central)
[void](Save-MavenArtifact 'io.ionic.libs' 'iongeolocation-android' '2.2.2' 'jar' $central)

$androidx = @(
  @{ g = 'androidx.activity'; a = 'activity-ktx'; v = '1.9.3' },
  @{ g = 'androidx.activity'; a = 'activity'; v = '1.9.3' },
  @{ g = 'androidx.activity'; a = 'activity-ktx'; v = '1.8.0' },
  @{ g = 'androidx.activity'; a = 'activity'; v = '1.8.0' },
  @{ g = 'androidx.activity'; a = 'activity'; v = '1.6.0' },
  @{ g = 'androidx.core'; a = 'core-ktx'; v = '1.13.1' },
  @{ g = 'androidx.core'; a = 'core'; v = '1.13.1' },
  @{ g = 'androidx.core'; a = 'core-ktx'; v = '1.13.0' },
  @{ g = 'androidx.core'; a = 'core'; v = '1.13.0' },
  @{ g = 'androidx.lifecycle'; a = 'lifecycle-viewmodel-ktx'; v = '2.6.2' },
  @{ g = 'androidx.lifecycle'; a = 'lifecycle-viewmodel'; v = '2.6.2' },
  @{ g = 'androidx.lifecycle'; a = 'lifecycle-viewmodel-savedstate'; v = '2.6.2' },
  @{ g = 'androidx.lifecycle'; a = 'lifecycle-runtime-ktx'; v = '2.6.2' },
  @{ g = 'androidx.lifecycle'; a = 'lifecycle-runtime'; v = '2.6.2' },
  @{ g = 'androidx.lifecycle'; a = 'lifecycle-common'; v = '2.6.2' },
  @{ g = 'androidx.lifecycle'; a = 'lifecycle-livedata'; v = '2.6.2' },
  @{ g = 'androidx.lifecycle'; a = 'lifecycle-livedata-core'; v = '2.6.2' },
  @{ g = 'androidx.lifecycle'; a = 'lifecycle-livedata-core-ktx'; v = '2.6.2' },
  @{ g = 'androidx.lifecycle'; a = 'lifecycle-livedata-ktx'; v = '2.6.2' },
  @{ g = 'androidx.lifecycle'; a = 'lifecycle-process'; v = '2.6.2' },
  @{ g = 'androidx.lifecycle'; a = 'lifecycle-common-java8'; v = '2.6.2' },
  @{ g = 'androidx.lifecycle'; a = 'lifecycle-service'; v = '2.6.2' },
  @{ g = 'androidx.lifecycle'; a = 'lifecycle-viewmodel-ktx'; v = '2.6.1' },
  @{ g = 'androidx.lifecycle'; a = 'lifecycle-runtime-ktx'; v = '2.6.1' },
  @{ g = 'androidx.savedstate'; a = 'savedstate-ktx'; v = '1.2.1' },
  @{ g = 'androidx.savedstate'; a = 'savedstate'; v = '1.2.1' }
)
foreach ($item in $androidx) {
  [void](Save-MavenArtifact $item.g $item.a $item.v 'pom' $google)
  $aar = Save-MavenArtifact $item.g $item.a $item.v 'aar' $google
  if (-not $aar) {
    [void](Save-MavenArtifact $item.g $item.a $item.v 'jar' $google)
    [void](Save-MavenArtifact $item.g $item.a $item.v 'jar' $central)
  }
  [void](Save-MavenArtifact $item.g $item.a $item.v 'module' $google)
}

Write-Host 'local-m2 sync done'
