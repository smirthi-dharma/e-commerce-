param([string]$SigningDirectory = "$env:USERPROFILE/.pandiyan-store-signing/upload-key-20261028")
$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$toolRoot = Join-Path (Split-Path $projectRoot) '.local/android-toolchain'
$env:JAVA_HOME = (Get-ChildItem (Join-Path $toolRoot 'jdk') -Directory | Select-Object -First 1).FullName
$env:PATH = "$env:JAVA_HOME/bin;$env:PATH"
$env:GRADLE_USER_HOME = Join-Path $toolRoot 'gradle-cache'
$env:PANDIYAN_SIGNING_DIR = $SigningDirectory
if (!(Test-Path (Join-Path $SigningDirectory 'upload-keystore.p12'))) { throw 'Upload keystore not found.' }
$sdkPath = (Join-Path $toolRoot 'sdk').Replace('\', '/').Replace(':', '\:')
"sdk.dir=$sdkPath" | Set-Content (Join-Path $projectRoot 'local.properties')
& (Join-Path $toolRoot 'gradle/gradle-8.13/bin/gradle.bat') -p $projectRoot --no-daemon :app:bundleRelease :app:assembleRelease :app:lintRelease
if ($LASTEXITCODE -ne 0) { throw 'Android build or lint failed.' }
