const { execFileSync } = require("child_process");
const fs = require("fs");

// Lee un input de Actions sin depender del paquete @actions/core.
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

// Expone un output para los pasos/jobs siguientes (equivalente a core.setOutput).
function setOutput(name, value) {
  const githubOutputPath = process.env.GITHUB_OUTPUT;
  fs.appendFileSync(githubOutputPath, `${name}=${value}\n`);
}

function fail(message) {
  console.log(`::error::${message}`);
  process.exitCode = 1;
}

function run() {
  const keyvaultName = getInput("keyvault-name", true);
  const secretName = getInput("secret-name", true);

  console.log(
    `Obteniendo el secreto "${secretName}" desde el Key Vault "${keyvaultName}"...`
  );

  // La sesion de "az" ya quedo autenticada por el paso previo "azure/login"
  // (OIDC) en el mismo job; aqui solo reutilizamos esa sesion via az CLI.
  const secretValue = execFileSync(
    "az",
    [
      "keyvault",
      "secret",
      "show",
      "--vault-name",
      keyvaultName,
      "--name",
      secretName,
      "--query",
      "value",
      "-o",
      "tsv",
    ],
    { encoding: "utf-8" }
  ).trim();

  if (!secretValue) {
    throw new Error(
      `No se pudo obtener un valor para el secreto "${secretName}" en el Key Vault "${keyvaultName}".`
    );
  }

  maskValue(secretValue);
  setOutput("secret-value", secretValue);

  console.log(
    "Secreto obtenido correctamente desde Azure Key Vault y expuesto como output enmascarado."
  );
}

try {
  run();
} catch (error) {
  fail(error.message);
}
