pipeline {
    agent any

    tools {
        nodejs 'NodeJS 22' // matches the name already configured in Manage Jenkins > Tools
    }

    environment {
        SALEOR_API_URL = 'http://localhost:8000/graphql/'
        SALEOR_DASHBOARD_URL = 'http://localhost:9000/'
        CI = 'true'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
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
                script {
                    def exitCode = powershell(script: 'npx playwright test', returnStatus: true)
                    if (exitCode != 0) {
                        unstable('Playwright tests failed — build marked unstable')
                    }
                }
            }
        }

        stage('Orphaned-order sanity check') {
            steps {
                // SCRUM-20 — non-blocking for now; logs a warning rather than
                // failing the build, since this is still being trusted incrementally.
                powershell '''
                    node scripts/check-orphaned-orders.js
                    if ($LASTEXITCODE -ne 0) {
                        Write-Host "Orphaned orders detected — see console output above"
                    }
                '''
            }
        }

        // Placeholder for SCRUM-12 (k6 + Grafana) — not yet implemented.
        // stage('Run k6 Load Tests') {
        //     steps {
        //         script {
        //             def exitCode = powershell(
        //                 script: 'k6 run --out influxdb=http://localhost:8086/k6 tests/k6/load-test.js | Tee-Object -FilePath k6-summary.txt',
        //                 returnStatus: true
        //             )
        //             if (exitCode != 0) {
        //                 unstable('k6 load tests failed or thresholds breached — build marked unstable')
        //             }
        //         }
        //     }
        // }

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
        }
        success {
            echo 'All tests passed.'
        }
        unstable {
            echo 'Some tests failed or orphaned orders were detected. Build marked unstable. Check the Playwright Report above.'
        }
        failure {
            echo 'Pipeline failed outside of test stages — check logs (Docker stack, npm install, etc).'
        }
        cleanup {
            dir('saleor-platform') {
                powershell 'docker compose down'
            }
        }
    }
}