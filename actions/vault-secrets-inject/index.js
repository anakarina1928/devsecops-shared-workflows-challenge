const fs = require("fs");

// Lee un input de Actions sin depender del paquete @actions/core.
// GitHub expone cada input como una variable de entorno INPUT_<NOMBRE EN MAYUSCULAS>.
function getInput(name, required) {
  const envName = `INPUT_${name.replace(/ /g, "_").toUpperCase()}`;
  const value = process.env[envName] || "";
  if (required && !value) {
    throw new Error(`El input requerido "${name}" no fue proporcionado.`);
  }
  return value;
}

// Enmascara un valor en los logs del job (equivalente a core.setSecret).
function maskValue(value) {
  console.log(`::add-mask::${value}`);
}

// Expone una variable de entorno para los pasos siguientes del job
// (equivalente a core.exportVariable), escribiendo al archivo $GITHUB_ENV.
function exportEnvVar(name, value) {
  const githubEnvPath = process.env.GITHUB_ENV;
  fs.appendFileSync(githubEnvPath, `${name}=${value}\n`);
}

// Marca el paso como fallido con un mensaje claro (equivalente a core.setFailed).
function fail(message) {
  console.log(`::error::${message}`);
  process.exitCode = 1;
}

async function run() {
  const vaultAddr = getInput("vault-addr", true).replace(/\/$/, "");
  const vaultRole = getInput("vault-role", true);
  const secretPath = getInput("secret-path", true);
  const envVarName = getInput("env-var-name", true);

  const oidcToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  const oidcUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  if (!oidcToken || !oidcUrl) {
    throw new Error(
      "No se encontró el token OIDC de GitHub. Asegúrate de declarar 'permissions: id-token: write' en el job que llama a esta action."
    );
  }

  // 1. Solicita el JWT de identidad de GitHub Actions (OIDC)
  const jwtResponse = await fetch(`${oidcUrl}&audience=vault`, {
    headers: { Authorization: `Bearer ${oidcToken}` },
  });
  if (!jwtResponse.ok) {
    throw new Error(`No se pudo obtener el JWT de OIDC: HTTP ${jwtResponse.status}`);
  }
  const { value: githubJwt } = await jwtResponse.json();

  // 2. Autentica ese JWT contra el auth method JWT/OIDC de Vault
  const loginResponse = await fetch(`${vaultAddr}/v1/auth/jwt/login`, {
    method: "POST",
    body: JSON.stringify({ role: vaultRole, jwt: githubJwt }),
  });
  if (!loginResponse.ok) {
    throw new Error(`Autenticación contra Vault falló: HTTP ${loginResponse.status}`);
  }
  const loginData = await loginResponse.json();
  const vaultToken = loginData.auth && loginData.auth.client_token;
  if (!vaultToken) {
    throw new Error("Vault no devolvió un client_token válido.");
  }
  maskValue(vaultToken);

  // 3. Con el token de Vault, lee el secreto solicitado
  const secretResponse = await fetch(`${vaultAddr}/v1/${secretPath}`, {
    headers: { "X-Vault-Token": vaultToken },
  });
  if (!secretResponse.ok) {
    throw new Error(`No se pudo leer el secreto en "${secretPath}": HTTP ${secretResponse.status}`);
  }
  const secretData = await secretResponse.json();
  const secretValue = secretData.data && secretData.data.data && secretData.data.data.value;
  if (!secretValue) {
    throw new Error(`El secreto en "${secretPath}" no tiene el campo esperado "value".`);
  }

  // 4. Enmascara el valor y lo expone como variable de entorno para los pasos siguientes
  maskValue(secretValue);
  exportEnvVar(envVarName, secretValue);

  console.log(`Secreto obtenido de Vault y expuesto en la variable de entorno "${envVarName}".`);
}

run().catch((error) => fail(error.message));
