pipeline {
    agent any

    tools {
        nodejs 'NodeJS 22' // matches the name already configured in Manage Jenkins > Tools
    }

    triggers {
        githubPush() // fires on webhook POST from GitHub (via your ngrok tunnel -> /github-webhook/)
    }

    environment {
        SALEOR_API_URL = 'http://localhost:8000/graphql/'
        DASHBOARD_URL = 'http://localhost:9000/'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Install dependencies') {
            steps {
                sh 'npm ci'
            }
        }

        stage('Install Playwright browsers') {
            steps {
                sh 'npx playwright install --with-deps'
            }
        }

        stage('Bring up Saleor stack') {
            steps {
                dir('saleor-platform') { // adjust if your compose file lives elsewhere
                    sh 'docker compose up -d'
                }
                sh '''
                    for i in $(seq 1 30); do
                        if curl -sf http://localhost:8000/graphql/ -o /dev/null; then
                            echo "API is up"
                            break
                        fi
                        echo "Waiting for API... ($i/30)"
                        sleep 2
                    done
                '''
            }
        }

        stage('Run Playwright suite (api + ui)') {
            steps {
                // Single invocation runs BOTH the api and ui projects defined in
                // playwright.config.js, producing one combined HTML report.
                // Deliberately NOT split into two separate `npx playwright test
                // --project=X` calls (unlike OpenCart's separate Newman/Playwright
                // stages) — two invocations would each regenerate playwright-report/
                // from scratch, so the second run would silently overwrite the first.
                script {
                    def exitCode = sh(script: 'npx playwright test', returnStatus: true)
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
                sh 'node scripts/check-orphaned-orders.js || echo "Orphaned orders detected — see console output above"'
            }
        }

        // Placeholder for SCRUM-12 (k6 + Grafana) — not yet implemented.
        // stage('Run k6 Load Tests') {
        //     steps {
        //         script {
        //             def exitCode = sh(
        //                 script: 'k6 run --out influxdb=http://localhost:8086/k6 tests/k6/load-test.js | tee k6-summary.txt',
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
        //             def exitCode = sh(
        //                 script: '''
        //                     docker run --rm \\
        //                         -v /opt/zap-reports:/zap/wrk/:rw \\
        //                         -v /opt/zap-scripts:/zap/scripts/:rw \\
        //                         -t zaproxy/zap-stable \\
        //                         zap.sh -cmd -autorun /zap/scripts/saleor-autorun.yaml
        //                 ''',
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
                sh 'docker compose down'
            }
        }
    }
}