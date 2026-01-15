#!/usr/bin/env node
/**
 * Check which runtimes are available on the system
 */

const { execSync } = require('child_process');

const runtimes = [
    { name: 'Node.js', cmd: 'node --version', required: true },
    { name: 'Bun', cmd: 'bun --version', required: false },
    { name: 'Deno', cmd: 'deno --version', required: false },
];

console.log('Runtime Availability Check\n');
console.log('═'.repeat(40));

let allRequiredAvailable = true;

for (const runtime of runtimes) {
    try {
        const version = execSync(runtime.cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
        console.log(`✓ ${runtime.name}: ${version.split('\n')[0]}`);
    } catch {
        const status = runtime.required ? '✗' : '○';
        console.log(`${status} ${runtime.name}: not available`);
        if (runtime.required) {
            allRequiredAvailable = false;
        }
    }
}

console.log('═'.repeat(40));

if (!allRequiredAvailable) {
    console.log('\n⚠ Some required runtimes are missing');
    process.exit(1);
}

console.log('\n✓ All required runtimes available');
