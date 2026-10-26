[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$frontendRoot = Join-Path $projectRoot 'angular-frontend'
$deploymentDir = Join-Path $projectRoot 'dist\deployment'
$stagingDir = Join-Path $deploymentDir '.staging'
$scratchFrontend = Join-Path $env:TEMP ("customer-portal-war-" + [guid]::NewGuid().ToString('N'))
$frontendDescriptorDir = Join-Path $frontendRoot 'deployment\WEB-INF'

function Invoke-CheckedCommand {
    param(
        [Parameter(Mandatory = $true)][string]$Command,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [Parameter(Mandatory = $true)][string]$WorkingDirectory
    )

    Push-Location $WorkingDirectory
    try {
        & $Command @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "'$Command $($Arguments -join ' ')' failed with exit code $LASTEXITCODE."
        }
    }
    finally {
        Pop-Location
    }
}

$frontendWarName = 'FreightCodeWeb.war'
$backendWarName = 'FreightCodeApi.war'
$frontendWarStaged = Join-Path $stagingDir $frontendWarName
$backendWarSource = Join-Path $projectRoot 'target\FreightCodeApi.war'

try {
    New-Item -ItemType Directory -Path $scratchFrontend -Force | Out-Null
    Get-ChildItem -LiteralPath $frontendRoot -Force |
        Where-Object { $_.Name -notin @('node_modules', 'dist', '.angular') } |
        Copy-Item -Destination $scratchFrontend -Recurse -Force

    Write-Host '[1/4] Installing frontend dependencies and building Angular production bundle...'
    Invoke-CheckedCommand -Command 'npm' -Arguments @('ci', '--no-audit', '--no-fund') -WorkingDirectory $scratchFrontend
    Invoke-CheckedCommand -Command 'npm' -Arguments @('run', 'build', '--', '--configuration', 'production') -WorkingDirectory $scratchFrontend

    $frontendDist = Join-Path $scratchFrontend 'dist'
    $indexFiles = @(Get-ChildItem -LiteralPath $frontendDist -Filter 'index.html' -File -Recurse -ErrorAction Stop)
    if ($indexFiles.Count -ne 1) {
        throw "Expected exactly one Angular index.html under '$frontendDist'; found $($indexFiles.Count)."
    }
    $frontendBuildDir = $indexFiles[0].DirectoryName
    $builtIndex = [System.IO.File]::ReadAllText($indexFiles[0].FullName)
    if ($builtIndex -notmatch '<base href="/FreightCodeWeb/">') {
        throw 'Production frontend index.html does not use the /FreightCodeWeb/ base href.'
    }
    $mainBundles = @(Get-ChildItem -LiteralPath $frontendBuildDir -Filter 'main-*.js' -File)
    if ($mainBundles.Count -eq 0) {
        throw "No compiled Angular main bundle was found in '$frontendBuildDir'."
    }
    $mainBundleContent = [System.IO.File]::ReadAllText($mainBundles[0].FullName)
    if ($mainBundleContent -notmatch '/FreightCodeApi/api') {
        throw 'Production Angular bundle does not use /FreightCodeApi/api as its API base URL.'
    }
    if ($mainBundleContent -match 'http://localhost:8080') {
        throw 'Production Angular bundle contains a hardcoded localhost backend URL.'
    }

    if (-not (Test-Path -LiteralPath $frontendDescriptorDir -PathType Container)) {
        throw "Frontend WebLogic descriptors were not found at '$frontendDescriptorDir'."
    }

    if (Test-Path -LiteralPath $stagingDir) {
        Remove-Item -LiteralPath $stagingDir -Recurse -Force
    }
    New-Item -ItemType Directory -Path $stagingDir -Force | Out-Null
    $frontendWarRoot = Join-Path $stagingDir 'frontend'
    New-Item -ItemType Directory -Path $frontendWarRoot -Force | Out-Null
    Get-ChildItem -LiteralPath $frontendBuildDir -Force |
        Copy-Item -Destination $frontendWarRoot -Recurse -Force
    Copy-Item -LiteralPath $frontendDescriptorDir -Destination $frontendWarRoot -Recurse -Force

    $jarCommand = Get-Command 'jar.exe' -ErrorAction Stop
    Invoke-CheckedCommand -Command $jarCommand.Source -Arguments @('cf', $frontendWarStaged, '-C', $frontendWarRoot, '.') -WorkingDirectory $projectRoot

    $frontendEntries = @(& $jarCommand.Source tf $frontendWarStaged)
    if ($LASTEXITCODE -ne 0) {
        throw 'Could not inspect the generated frontend WAR.'
    }
    foreach ($requiredEntry in @('index.html', 'WEB-INF/web.xml', 'WEB-INF/weblogic.xml')) {
        if ($frontendEntries -notcontains $requiredEntry) {
            throw "Frontend WAR is missing required entry '$requiredEntry'."
        }
    }
    $frontendDescriptor = [System.IO.File]::ReadAllText((Join-Path $frontendDescriptorDir 'weblogic.xml'))
    if ($frontendDescriptor -notmatch '<context-root>FreightCodeWeb</context-root>') {
        throw 'Frontend WebLogic descriptor must declare the FreightCodeWeb context root.'
    }
    if (-not ($frontendEntries | Where-Object { $_ -match '^main-[^/]+\.js$' })) {
        throw 'Frontend WAR does not contain the compiled Angular JavaScript bundle.'
    }
    if (-not ($frontendEntries | Where-Object { $_ -match '^assets/' })) {
        throw 'Frontend WAR does not contain the Angular public assets.'
    }
    Write-Host "SUCCESS: Created and verified $frontendWarName."

    Write-Host '[2/4] Building and testing the Spring Boot backend WAR...'
    Invoke-CheckedCommand -Command (Join-Path $projectRoot 'mvnw.cmd') -Arguments @('clean', 'package') -WorkingDirectory $projectRoot
    if (-not (Test-Path -LiteralPath $backendWarSource -PathType Leaf)) {
        throw "Backend WAR was not created at '$backendWarSource'."
    }

    $backendEntries = @(& $jarCommand.Source tf $backendWarSource)
    if ($LASTEXITCODE -ne 0) {
        throw 'Could not inspect the generated backend WAR.'
    }
    foreach ($requiredEntry in @(
        'WEB-INF/weblogic.xml',
        'WEB-INF/classes/com/cris/customerportal/controller/AuthController.class',
        'WEB-INF/classes/com/cris/customerportal/controller/CustomerController.class'
    )) {
        if ($backendEntries -notcontains $requiredEntry) {
            throw "Backend WAR is missing required entry '$requiredEntry'."
        }
    }
    $backendDescriptor = [System.IO.File]::ReadAllText((Join-Path $projectRoot 'src\main\webapp\WEB-INF\weblogic.xml'))
    if ($backendDescriptor -notmatch '<context-root>FreightCodeApi</context-root>') {
        throw 'Backend WebLogic descriptor must declare the FreightCodeApi context root.'
    }
    if (-not ($backendEntries | Where-Object { $_ -match '^WEB-INF/lib/spring-boot-' })) {
        throw 'Backend WAR does not contain Spring Boot runtime dependencies.'
    }
    if ($backendEntries -contains 'WEB-INF/classes/static/index.html') {
        throw 'Backend WAR unexpectedly contains the Angular frontend; expected independent WARs.'
    }
    if ($backendEntries | Where-Object { $_ -match '^WEB-INF/lib(-provided)?/(tomcat-embed-|spring-boot-starter-tomcat)' }) {
        throw 'Backend WAR contains embedded Tomcat libraries; WebLogic supplies the servlet container.'
    }
    if ($backendEntries | Where-Object { $_ -match '^WEB-INF/lib(-provided)?/(javax\.servlet-api|jakarta\.servlet-api|javax\.el-api|jakarta\.el-api)' }) {
        throw 'Backend WAR contains a Servlet or EL API jar that must be supplied by WebLogic.'
    }
    Write-Host "SUCCESS: Created and verified $backendWarName."

    Write-Host '[3/4] Publishing both WAR files...'
    New-Item -ItemType Directory -Path $deploymentDir -Force | Out-Null
    Copy-Item -LiteralPath $frontendWarStaged -Destination (Join-Path $deploymentDir $frontendWarName) -Force
    Copy-Item -LiteralPath $backendWarSource -Destination (Join-Path $deploymentDir $backendWarName) -Force

    Write-Host '[4/4] Build complete.'
    Write-Host "Frontend: $(Join-Path $deploymentDir $frontendWarName)"
    Write-Host "Backend:  $(Join-Path $deploymentDir $backendWarName)"
}
catch {
    Write-Error "WAR build failed: $($_.Exception.Message)"
    exit 1
}
finally {
    if (Test-Path -LiteralPath $stagingDir) {
        Remove-Item -LiteralPath $stagingDir -Recurse -Force
    }
    if (Test-Path -LiteralPath $scratchFrontend) {
        Remove-Item -LiteralPath $scratchFrontend -Recurse -Force
    }
}
