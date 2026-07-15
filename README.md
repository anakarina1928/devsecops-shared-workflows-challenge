# devsecops-shared-workflows-challenge

Reusable workflows y composite actions para la plataforma de CI/CD segura sobre GitHub Actions + Azure (AKS, ACR) del challenge DevSecOps.

## Contenido

| Recurso | Ruta | Descripción |
|---|---|---|
| Build & Test | `.github/workflows/reusable-build-test.yml` | Compila el proyecto Maven y corre los tests unitarios |
| Security Scan | `.github/workflows/reusable-security-scan.yml` | Corre CodeQL (SAST) y Trivy (container scan), sube resultados a la pestaña Security y aplica el gate de severidad |
| Docker Build & Push | `.github/workflows/reusable-docker-build.yml` | Construye la imagen Docker y la publica en Azure Container Registry vía OIDC |
| Deploy to AKS | `.github/workflows/reusable-deploy-aks.yml` | Despliega con Helm hacia el cluster AKS, en el ambiente y namespace indicados |
| Vault Secrets Inject | `actions/vault-secrets-inject/` | Action propia en **JavaScript** (Node 20, sin dependencias externas) que autentica contra HashiCorp Vault vía JWT/OIDC y expone un secreto como variable de entorno enmascarada |

## Cómo consumir estos workflows

Desde el repo del microservicio:

```yaml
jobs:
  build:
    uses: anakarina1928/devsecops-shared-workflows-challenge/.github/workflows/reusable-build-test.yml@v1

  security:
    needs: build
    uses: anakarina1928/devsecops-shared-workflows-challenge/.github/workflows/reusable-security-scan.yml@v1
    with:
      image-ref: ""

  docker:
    needs: security
    uses: anakarina1928/devsecops-shared-workflows-challenge/.github/workflows/reusable-docker-build.yml@v1
    with:
      registry: miacr.azurecr.io
      image-name: microservicio
      image-tag: ${{ github.sha }}
    secrets: inherit

  deploy:
    needs: docker
    uses: anakarina1928/devsecops-shared-workflows-challenge/.github/workflows/reusable-deploy-aks.yml@v1
    with:
      environment: prod
      namespace: prod
      image-ref: ${{ needs.docker.outputs.full-image-ref }}
      resource-group: rg-devsecops-challenge
      aks-cluster-name: aks-devsecops-challenge-ana
    secrets: inherit
```

## Uso de la action de Vault dentro de un job

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
    steps:
      - name: Obtener secreto de Vault
        uses: anakarina1928/devsecops-shared-workflows-challenge/actions/vault-secrets-inject@v1
        with:
          vault-addr: https://vault.miempresa.com
          vault-role: github-actions-role
          secret-path: secret/data/microservicio/prod
          env-var-name: DB_PASSWORD

      - name: Usar el secreto
        run: echo "La app ya tiene DB_PASSWORD disponible como variable de entorno"
```

Nota: el job que use esta action debe declarar `permissions: id-token: write`, ya que la action solicita internamente el token OIDC de GitHub para autenticarse contra Vault.

## Versionado

Este repo se versiona con tags semánticos (`v1.0.0`, `v1.1.0`, ...). Los consumidores deben referenciar una versión fija (`@v1`) en vez de `@main`, para evitar romper pipelines con cambios no controlados.

## Secretos requeridos (a nivel de organización o del repo consumidor)

- `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` — usados para autenticación OIDC contra Azure (Federated Credential), sin secretos estáticos de larga duración.

## Buenas prácticas aplicadas

- Pinning de todas las actions por SHA (no por tag mutable)
- Permisos explícitos y mínimos por workflow (`permissions:`)
- Autenticación 100% vía OIDC (GitHub ↔ Azure, y GitHub ↔ Vault)
- Una responsabilidad por workflow (principio de single responsibility)
