@Library('ontotext-platform@v0.1.49') _

def performCleanup = {
    dir("${env.WORKSPACE}") {
        sh "git restore .npmrc || git checkout HEAD -- .npmrc"
    }
}

pipeline {
    agent {
        label 'aws-small'
    }

    tools {
        nodejs 'nodejs-18.9.0'
    }

    environment {
        NPM_CONFIG_REGISTRY = 'https://registry.npmjs.org/'
    }

    parameters {
        gitParameter name: 'GIT_BRANCH',
            description: 'The Git branch to build',
            branchFilter: 'origin/(.*)',
            defaultValue: 'main',
            selectedValue: 'DEFAULT',
            type: 'PT_BRANCH',
            listSize: '0',
            quickFilterEnabled: true

        string name: 'RELEASE_VERSION',
            description: 'Version to release',
            defaultValue: ''
    }

    options {
        disableConcurrentBuilds()
        timeout(time: 15, unit: 'MINUTES')
        timestamps()
    }

    stages {
        stage ('Prepare & Publish') {
            steps {
                script {
                    git_cmd.checkout(branch: params.GIT_BRANCH)
                    npm.prepareRelease(version: params.RELEASE_VERSION, scripts: ['prepare'])

                    withKsm(application: [
                        [
                            credentialsId: 'ksm-jenkins',
                            secrets: [
                                [destination: 'env', envVar: 'NPM_TOKEN', filePath: '', notation: 'keeper://FcbEgbi287PN2yx_3uCz4Q/field/note'],
                            ]
                        ]
                    ]) {
                        sh "echo //registry.npmjs.org/:_authToken=${NPM_TOKEN} > .npmrc"
                        sh "npm whoami || echo 'whoami failed'"
                        sh "npm publish"
                    }
                }
            }
        }
    }

    post {
        success {
            script {
                performCleanup()

                // Commit and tag the release
                sh "git commit -a -m 'Release ${params.RELEASE_VERSION}'"
                sh "git tag -a v${params.RELEASE_VERSION} -m 'Release v${params.RELEASE_VERSION}'"

                withKsm(application: [
                    [
                        credentialsId: 'ksm-jenkins',
                        secrets: [
                            [destination: 'env', envVar: 'GIT_USER', filePath: '', notation: 'keeper://8hm1g9HCfBPgoWAmpiHn6w/field/login'],
                            [destination: 'env', envVar: 'GIT_TOKEN', filePath: '', notation: 'keeper://8hm1g9HCfBPgoWAmpiHn6w/field/password']
                        ]
                    ]
                ]) {
                    sh 'mkdir -p ~/.ssh'
                    sh 'ssh-keyscan github.com >> ~/.ssh/known_hosts'

                    sh 'git config --global user.name "$GIT_USER"'
                    sh 'git config --global user.email "$GIT_USER@users.noreply.github.com"'

                    sh 'git remote set-url origin git@github.com:Ontotext-AD/graphdb-mcp-gateway.git'
                    sh "git push --set-upstream origin ${params.GIT_BRANCH}"
                    sh 'git push --tags'
                }
            }
        }

        failure {
            wrap([$class: 'BuildUser']) {
                sendMail(env.BUILD_USER_EMAIL)
            }

            script {
                performCleanup()
            }
        }
    }
}