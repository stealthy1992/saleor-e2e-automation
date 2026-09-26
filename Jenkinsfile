pipeline {
    agent any

    tools {
        nodejs 'NodeJS 22' // matches the name already configured in Manage Jenkins > Tools
    }

    parameters {
        // TEST_PRODUCT_ID: id of a product reserved for perf runs — see
        // tests/k6/scenarios/product-variant-creation.js header comment.
        string(name: 'TEST_PRODUCT_ID', defaultValue: 'UHJvZHVjdDoxNTI=', description: 'Product ID reserved for k6 variant-creation load test (required)')
        string(name: 'TEST_CHECKOUT_VARIANT_ID', defaultValue: 'UHJvZHVjdFZhcmlhbnQ6Mzg0', description: 'Variant ID with stock, used by k6 to seed its own orders for the refund load test (required)')
    }

    environment {
        SALEOR_API_URL = 'http://localhost:8000/graphql/'
        SALEOR_DASHBOARD_URL = 'http://localhost:9000/'
        INFLUXDB_URL = 'http://localhost:8086/k6'
        GRAFANA_URL = 'http://localhost:3000/d/saleor-k6-perf'
        CI = 'true'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout([
                    $class: 'GitSCM',
                    branches: scm.branches,
                    extensions: [[$class: 'SubmoduleOption', recursiveSubmodules: true]],
                    userRemoteConfigs: scm.userRemoteConfigs
                ])
            }
        }

        stage('Install dependencies') {
            steps {
                powershell 'npm ci'
            }
        }

        stage('Install Playwright browsers') {
            steps {
                // --with-deps is a Linux-only flag (apt-based system deps) — omit
                // it on Windows, browser binaries alone are what's needed here.
                powershell 'npx playwright install'
            }
        }

        stage('Bring up Saleor stack') {
            steps {
                dir('saleor-platform') { // adjust if your compose file lives elsewhere

                    withCredentials([string(credentialsId: 'SALEOR_SECRET_KEY', variable: 'SECRET_KEY')]) {
                        powershell '''
                            $content = [System.IO.File]::ReadAllText("backend.env")
                            $content = $content -replace '(?m)^SECRET_KEY=.*', "SECRET_KEY=$env:SECRET_KEY"
                            [System.IO.File]::WriteAllText("backend.env", $content, (New-Object System.Text.UTF8Encoding $false))
                            Get-FileHash backend.env | Format-List
                        '''
                    }
                    powershell 'docker compose up -d'
                }
                powershell '''
                    $ready = $false
                    for ($i = 1; $i -le 30; $i++) {
                        try {
                            $response = Invoke-WebRequest -Uri "http://localhost:8000/graphql/" -UseBasicParsing -TimeoutSec 3
                            Write-Host "API is up"
                            $ready = $true
                            break
                        } catch {
                            Write-Host "Waiting for API... ($i/30)"
                            Start-Sleep -Seconds 2
                        }
                    }
                    for ($i = 1; $i -le 30; $i++) {
                        try {
                            $response = Invoke-WebRequest -Uri "http://localhost:9000" -UseBasicParsing -TimeoutSec 3
                            Write-Host "Dashboard is up"
                            break
                        } catch {
                            Write-Host "Waiting for Dashboard... ($i/30)"
                            Start-Sleep -Seconds 2
                        }
                    }
                    for ($i = 1; $i -le 30; $i++) {
                        try {
                            $body = '{"query":"{ shop { name } }"}'
                            $response = Invoke-WebRequest -Uri "http://localhost:8000/graphql/" -Method POST -Body $body -ContentType "application/json" -UseBasicParsing -TimeoutSec 3
                            if ($response.Content -match '"name"') {
                                Write-Host "GraphQL is answering real queries"
                                break
                            }
                        } catch {
                            Write-Host "Waiting for GraphQL to answer queries... ($i/30)"
                            Start-Sleep -Seconds 2
                        }
                    }
                    if (-not $ready) {
                        Write-Host "API did not become ready in time"
                        exit 1
                    }
                '''
            }
        }

        stage('Run Playwright suite (api + ui)') {
            steps {
                // Single invocation runs BOTH the api and ui projects defined in
                // playwright.config.js, producing one combined HTML report.
                // Deliberately NOT split into two separate `npx playwright test
                // --project=X` calls — two invocations would each regenerate
                // playwright-report/ from scratch, so the second would silently
                // overwrite the first's report.
                withCredentials([
                    string(credentialsId: 'SALEOR_ADMIN_EMAIL', variable: 'ADMIN_EMAIL'),
                    string(credentialsId: 'SALEOR_ADMIN_PASSWORD', variable: 'ADMIN_PASSWORD'),
                    string(credentialsId: 'SALEOR_LIMITED_ACCESS_USER_EMAIL', variable: 'LIMITED_ACCESS_USER_EMAIL'),
                    string(credentialsId: 'SALEOR_LIMITED_ACCESS_USER_PASSWORD', variable: 'LIMITED_ACCESS_USER_PASSWORD'),
                    string(credentialsId: 'SALEOR_DATABASE_URL', variable: 'DATABASE_URL')
                ]) {
                    script {
                        def exitCode = powershell(script: 'npx playwright test', returnStatus: true)
                        if (exitCode != 0) {
                            unstable('Playwright tests failed — build marked unstable')
                        }
                    }
                }
            }
        }

        stage('Bring up k6 performance stack (InfluxDB + Grafana)') {
            steps {
                // Idempotent — `docker compose up -d` is a no-op if the stack is
                // already running. Deliberately NOT torn down in post/cleanup:
                // this stack is long-lived so Grafana keeps historical data
                // across builds. See docker-compose.perf.yml header comment.
                powershell 'docker compose -f docker-compose.perf.yml up -d'
                powershell '''
                    for ($i = 1; $i -le 15; $i++) {
                        try {
                            $response = Invoke-WebRequest -Uri "http://localhost:8086/ping" -UseBasicParsing -TimeoutSec 3
                            Write-Host "InfluxDB is up"
                            break
                        } catch {
                            Write-Host "Waiting for InfluxDB... ($i/15)"
                            Start-Sleep -Seconds 2
                        }
                    }
                '''
            }
        }

        stage('Run k6 Performance Tests') {
            when {
                expression { return params.TEST_PRODUCT_ID?.trim() && params.TEST_CHECKOUT_VARIANT_ID?.trim() }
            }
            steps {
                withCredentials([
                    string(credentialsId: 'SALEOR_ADMIN_EMAIL', variable: 'ADMIN_EMAIL'),
                    string(credentialsId: 'SALEOR_ADMIN_PASSWORD', variable: 'ADMIN_PASSWORD')
                ]) {
                    script {
                        // Two separate k6 invocations, both writing to the same
                        // InfluxDB bucket under different `scenario` tags — unlike
                        // the Playwright HTML report, InfluxDB output is additive,
                        // so this does NOT overwrite results between runs.
                        def variantExit = powershell(
                            script: '''
                                k6 run tests/k6/scenarios/product-variant-creation.js `
                                    --out influxdb=$env:INFLUXDB_URL `
                                    -e SALEOR_API_URL=$env:SALEOR_API_URL `
                                    -e SALEOR_ADMIN_EMAIL=$env:ADMIN_EMAIL `
                                    -e SALEOR_ADMIN_PASSWORD=$env:ADMIN_PASSWORD `
                                    -e TEST_PRODUCT_ID=$env:TEST_PRODUCT_ID
                            ''',
                            returnStatus: true
                        )

                        def refundExit = powershell(
                            script: '''
                                k6 run tests/k6/scenarios/order-refund.js `
                                    --out influxdb=$env:INFLUXDB_URL `
                                    -e SALEOR_API_URL=$env:SALEOR_API_URL `
                                    -e SALEOR_ADMIN_EMAIL=$env:ADMIN_EMAIL `
                                    -e SALEOR_ADMIN_PASSWORD=$env:ADMIN_PASSWORD `
                                    -e TEST_CHECKOUT_VARIANT_ID=$env:TEST_CHECKOUT_VARIANT_ID
                            ''',
                            returnStatus: true
                        )

                        if (variantExit != 0 || refundExit != 0) {
                            unstable('k6 performance thresholds breached (p95 < 500ms / error rate < 1%) — build marked unstable')
                        }

                        echo "View results: ${env.GRAFANA_URL}"
                    }
                }
            }
        }

        // Placeholder for SCRUM-14 (OWASP ZAP) — not yet implemented.
        // stage('Run OWASP ZAP Authenticated Scan') {
        //     steps {
        //         script {
        //             def exitCode = powershell(
        //                 script: 'docker run --rm -v C:\\zap-reports:/zap/wrk/:rw -v C:\\zap-scripts:/zap/scripts/:rw -t zaproxy/zap-stable zap.sh -cmd -autorun /zap/scripts/saleor-autorun.yaml',
        //                 returnStatus: true
        //             )
        //             if (exitCode >= 1) {
        //                 unstable('ZAP scan found issues — build marked unstable. Review ZAP report.')
        //             }
        //         }
        //     }
        // }
    }

    post {
        always {
            // Requires the HTML Publisher plugin.
            // CSP note: run System.setProperty("hudson.model.DirectoryBrowserSupport.CSP", "")
            // in Manage Jenkins > Script Console before triggering the build —
            // kept as a manual pre-build step for now per your decision.
            publishHTML(target: [
                allowMissing: false,
                alwaysLinkToLastBuild: true,
                keepAll: true,
                reportDir: 'playwright-report',
                reportFiles: 'index.html',
                reportName: 'Playwright Report'
            ])
            archiveArtifacts artifacts: 'test-results/**', allowEmptyArchive: true
            archiveArtifacts artifacts: 'reports/*.html', allowEmptyArchive: true
        }
        success {
            echo 'All tests passed.'
        }
        unstable {
            echo 'Some tests failed, orphaned orders were detected, or k6 performance thresholds were breached. Build marked unstable. Check the Playwright Report and Grafana dashboard.'
        }
        failure {
            echo 'Pipeline failed outside of test stages — check logs (Docker stack, npm install, etc).'
        }
        cleanup {
            // Only the Saleor application stack is torn down. The k6 perf
            // stack (InfluxDB + Grafana) stays up — see stage comment above.
            dir('saleor-platform') {
                powershell 'docker compose down'
            }
        }
    }
}
