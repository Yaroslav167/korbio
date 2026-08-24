import { access, mkdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const label = "com.korbio.family";
const domain = `gui/${process.getuid()}`;
const launchAgents = join(homedir(), "Library", "LaunchAgents");
const plistPath = join(launchAgents, `${label}.plist`);
const logPath = join(root, "data", "korbio-server.log");
const errorLogPath = join(root, "data", "korbio-server-error.log");

function xml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function launchctl(args, { allowFailure = false } = {}) {
  const result = spawnSync("/bin/launchctl", args, { encoding: "utf8" });
  if (!allowFailure && result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "launchctl konnte nicht ausgeführt werden").trim());
  }
  return result;
}

async function install() {
  await access(join(root, ".env")).catch(() => {
    throw new Error("Die Familienkasse muss zuerst mit ‚Korbio einrichten.command‘ eingerichtet werden.");
  });
  await mkdir(launchAgents, { recursive: true });
  await mkdir(join(root, "data"), { recursive: true });
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xml(process.execPath)}</string>
    <string>${xml(join(root, "server.js"))}</string>
  </array>
  <key>WorkingDirectory</key><string>${xml(root)}</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>5</integer>
  <key>StandardOutPath</key><string>${xml(logPath)}</string>
  <key>StandardErrorPath</key><string>${xml(errorLogPath)}</string>
</dict>
</plist>
`;
  await writeFile(plistPath, plist, { encoding: "utf8", mode: 0o644 });
  launchctl(["bootout", domain, plistPath], { allowFailure: true });
  launchctl(["bootstrap", domain, plistPath]);
  launchctl(["enable", `${domain}/${label}`]);
  launchctl(["kickstart", "-k", `${domain}/${label}`]);
  console.log("Korbio startet jetzt automatisch beim Login und wird bei einem Absturz neu gestartet.");
  console.log("Adresse: http://localhost:4173");
}

async function uninstall() {
  launchctl(["bootout", domain, plistPath], { allowFailure: true });
  await rm(plistPath, { force: true });
  console.log("Der automatische Korbio-Start wurde deaktiviert.");
}

const action = process.argv[2] || "install";
if (action === "install") await install();
else if (action === "uninstall") await uninstall();
else throw new Error("Unbekannte Aktion. Verwende install oder uninstall.");
