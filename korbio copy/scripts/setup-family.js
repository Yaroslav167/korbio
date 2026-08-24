import { chmod, readFile, writeFile } from "node:fs/promises";
import { randomBytes, scryptSync } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function ask(prompt, { hidden = false } = {}) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) return reject(new Error("Die Einrichtung benötigt ein Terminal."));
    process.stdout.write(prompt);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    let value = "";
    const onData = (character) => {
      if (character === "\u0003") {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdout.write("\n");
        process.exit(130);
      }
      if (character === "\r" || character === "\n") {
        process.stdin.off("data", onData);
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdout.write("\n");
        resolve(value.trim());
        return;
      }
      if (character === "\u007f" || character === "\b") {
        if (value) {
          value = value.slice(0, -1);
          process.stdout.write("\b \b");
        }
        return;
      }
      if (character >= " ") {
        value += character;
        process.stdout.write(hidden ? "•" : character);
      }
    };
    process.stdin.on("data", onData);
  });
}

function upsertEnv(text, key, value) {
  const safeValue = String(value).replace(/[\r\n]/g, "");
  const line = `${key}=${safeValue}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  return pattern.test(text) ? text.replace(pattern, line) : `${text.trimEnd()}\n${line}\n`;
}

function removeEnv(text, key) {
  return text.replace(new RegExp(`^${key}=.*(?:\\r?\\n|$)`, "m"), "");
}

function passwordHash(password) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${scryptSync(password, salt, 32).toString("hex")}`;
}

async function askUntil(prompt, validator, options) {
  while (true) {
    const value = await ask(prompt, options);
    const error = validator(value);
    if (!error) return value;
    process.stdout.write(`${error}\n`);
  }
}

console.log("\nKorbio Familienkasse – private Einrichtung\n");
console.log("Die Angaben werden nur lokal in .env gespeichert und nicht hochgeladen.\n");

const iban = await askUntil("IBAN (optional – Enter für Barzahlung): ", (value) => {
  const normalized = value.replace(/\s+/g, "").toUpperCase();
  return !normalized || /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(normalized) ? "" : "Die IBAN hat kein gültiges Format.";
});
const accountHolder = iban
  ? await askUntil("Kontoinhaber: ", (value) => value.length < 2 ? "Bitte den vollständigen Kontoinhaber eingeben." : "")
  : "";
const familyPassword = await askUntil("Familienpasswort (mindestens 10 Zeichen): ", (value) => value.length < 10 ? "Das Passwort ist zu kurz." : "", { hidden: true });
await askUntil("Familienpasswort wiederholen: ", (value) => value !== familyPassword ? "Die Passwörter stimmen nicht überein." : "", { hidden: true });
const adminPassword = await askUntil("Adminpasswort (mindestens 12 Zeichen): ", (value) => {
  if (value.length < 12) return "Das Adminpasswort ist zu kurz.";
  if (value === familyPassword) return "Admin- und Familienpasswort müssen verschieden sein.";
  return "";
}, { hidden: true });
await askUntil("Adminpasswort wiederholen: ", (value) => value !== adminPassword ? "Die Passwörter stimmen nicht überein." : "", { hidden: true });

const envPath = join(root, ".env");
let env = await readFile(envPath, "utf8").catch(() => "# Private Korbio-Familienkasse\nAPP_URL=http://localhost:4173\n");
env = upsertEnv(env, "FAMILY_ACCOUNT_HOLDER", accountHolder);
env = upsertEnv(env, "FAMILY_IBAN", iban.replace(/\s+/g, "").toUpperCase());
env = removeEnv(env, "FAMILY_ACCESS_PASSWORD");
env = removeEnv(env, "FAMILY_ADMIN_PASSWORD");
env = upsertEnv(env, "FAMILY_ACCESS_PASSWORD_HASH", passwordHash(familyPassword));
env = upsertEnv(env, "FAMILY_ADMIN_PASSWORD_HASH", passwordHash(adminPassword));
await writeFile(envPath, env, { encoding: "utf8", mode: 0o600 });
await chmod(envPath, 0o600);

console.log("\nFertig. Die Familienkasse ist eingerichtet.");
console.log("Starte Korbio jetzt mit ‚Korbio starten.command‘.\n");
