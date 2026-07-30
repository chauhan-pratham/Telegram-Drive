import fs from 'fs';
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.join(__dirname, '.env');

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const equalsIdx = trimmed.indexOf('=');
      if (equalsIdx !== -1) {
        const key = trimmed.substring(0, equalsIdx).trim();
        let val = trimmed.substring(equalsIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        process.env[key] = val;
      }
    }
  });
  console.log('[build-app] Loaded environment variables from .env');
}

const isWin = process.platform === 'win32';
const command = isWin ? 'npx.cmd' : 'npx';
const args = ['tauri', 'build'];

const result = spawnSync(command, args, {
  stdio: 'inherit',
  env: process.env,
  shell: true,
});

if (result.error) {
  console.error('[build-app] Execution error:', result.error);
  process.exit(1);
}

process.exit(result.status !== null ? result.status : 1);

