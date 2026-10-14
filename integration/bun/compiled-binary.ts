#!/usr/bin/env bun
/**
 * A single-file executable made with `bun build --compile` serves api-ape from a
 * `controllers` map and answers a call from the real browser client, when started from
 * a folder that has no controller files.
 *
 * Why it needs `controllers`: `where` scans a folder with `fs.readdirSync` at start-up,
 * and inside a compiled executable that folder is not on disk (a reviewer saw the binary
 * crash in `walkDir` / `readdirSync` when run from another folder). The map is built
 * from `import`s the bundler can see, so nothing is read at run time.
 *
 * Steps: write a tiny server that imports two controllers and passes `controllers`;
 * `bun build --compile` it; start the binary with an empty folder as its cwd; read its
 * port from stdout; make one RPC with the page client; stop the binary by its pid.
 *
 * Skipped, with a message and exit code 0, only when this Bun cannot `build --compile`.
 * Any other problem is a failure.
 *
 * Usage: bun integration/bun/compiled-binary.ts
 *        APE_ROOT=/path/to/older/checkout bun integration/bun/compiled-binary.ts   (fails: no `controllers` option)
 *        CONTROL=1 bun integration/bun/compiled-binary.ts   (also shows `where` crashing in a binary)
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

const ROOT = process.env.APE_ROOT ?? resolve(import.meta.dir, '../..');

/** Does this Bun have `build --compile`? */
function compileAvailable(): boolean {
    const help = Bun.spawnSync(['bun', 'build', '--help']);
    return help.exitCode === 0 && /--compile\b/.test(help.stdout.toString());
}

/** Throw unless `cond`. */
function assert(cond: unknown, msg: string): asserts cond {
    if (!cond) throw new Error(msg);
}

/**
 * Write the tiny server, compile it, and return the binary's path.
 *
 * @param work - Scratch folder
 * @param useWhere - Build the `where` variant (the control) instead of `controllers`
 */
function compile(work: string, useWhere: boolean): string {
    const src = join(work, 'src');
    mkdirSync(join(src, 'api', 'cards'), { recursive: true });
    writeFileSync(join(src, 'api', 'cards', 'move.ts'), `export default function (d: any) { return { moved: d.id, to: d.to, where: 'compiled' }; }\n`);
    writeFileSync(join(src, 'api', 'hello.ts'), `export default function (name: string) { return 'Hello, ' + name + '!'; }\n`);
    const source = `
import { apeBun } from ${JSON.stringify(join(ROOT, 'server/lib/bun.js'))};
import move from './api/cards/move';
import hello from './api/hello';
const ape = apeBun(${useWhere
        ? `{ where: 'api', selector: ['ts'], logging: false }`
        : `{ controllers: { 'cards/move': move, hello }, logging: false }`});
const server = Bun.serve({
    port: 0,
    fetch: (req, srv) => ape.fetch(req, srv) ?? new Response('not found', { status: 404 }),
    websocket: ape.websocket,
});
console.log('LISTENING ' + server.port);
`;
    writeFileSync(join(src, 'server.ts'), source);
    const bin = join(work, useWhere ? 'server-where' : 'server');
    const built = Bun.spawnSync(['bun', 'build', '--compile', join(src, 'server.ts'), '--outfile', bin], { cwd: work });
    assert(built.exitCode === 0, `bun build --compile failed:\n${built.stderr.toString()}${built.stdout.toString()}`);
    return bin;
}

/**
 * Start the binary with `cwd` as its working folder and wait for its port.
 *
 * @returns the process (kill it by `.kill()`, which signals the recorded pid) and its port, or the output of a binary that died
 */
async function start(bin: string, cwd: string): Promise<{ proc: any; port?: number; output: string }> {
    const proc = Bun.spawn([bin], { cwd, stdout: 'pipe', stderr: 'pipe' });
    let output = '';
    const decoder = new TextDecoder();
    const deadline = Date.now() + 15000;
    const reader = (proc.stdout as ReadableStream<Uint8Array>).getReader();
    const errReader = (proc.stderr as ReadableStream<Uint8Array>).getReader();
    void (async () => { for (;;) { const { done, value } = await errReader.read(); if (done) return; output += decoder.decode(value); } })();
    let pending = reader.read();
    while (Date.now() < deadline) {
        // One read stays pending across ticks: dropping a pending read would lose its chunk.
        const next = await Promise.race([pending, Bun.sleep(200).then(() => 'tick' as const)]);
        if (next === 'tick') continue;
        if (next.done) break;
        output += decoder.decode(next.value);
        const match = /LISTENING (\d+)/.exec(output);
        if (match) return { proc, port: Number(match[1]), output };
        pending = reader.read();
    }
    proc.kill();
    return { proc, output };
}

/** One RPC with the real browser client, as a page would make it. */
async function rpc(port: number): Promise<any> {
    const g: any = globalThis;
    g.window = g;
    g.document = { cookie: '' };
    g.location = { protocol: 'http:', hostname: 'localhost', port: String(port), host: `localhost:${port}` };
    g.navigator = { onLine: true };
    g.addEventListener = () => {};
    const api: any = (await import(resolve(ROOT, 'client/index.js'))).default;
    const guard = <T>(p: Promise<T>) => Promise.race([p, new Promise<never>((_, no) => setTimeout(() => no(new Error('no reply in 10 s')), 10000))]);
    return { move: await guard(api.cards.move({ id: 7, to: 'done' })), hello: await guard(api.hello('World')) };
}

async function main() {
    console.log(`compiled single-file executable (Bun ${Bun.version})`);
    if (!compileAvailable()) {
        console.log('  SKIPPED: this Bun cannot `bun build --compile`; nothing was tested');
        return 0;
    }
    const work = mkdtempSync(join(tmpdir(), 'ape-compiled-'));
    const elsewhere = mkdtempSync(join(tmpdir(), 'ape-compiled-cwd-'));
    let proc: any;
    try {
        if (process.env.CONTROL) {
            const control = await start(compile(work, true), elsewhere);
            control.proc.kill();
            console.log(control.port
                ? '  control: the `where` binary started here (the crash this feature avoids did not reproduce on this Bun)'
                : `  control: the \`where\` binary did not start from another folder, as expected:\n    ${control.output.split('\n').slice(0, 4).join('\n    ')}`);
        }
        const bin = compile(work, false);
        const started = await start(bin, elsewhere);
        proc = started.proc;
        assert(started.port, `the compiled binary did not start from ${elsewhere}:\n${started.output}`);
        const seen = await rpc(started.port);
        assert(seen.move?.moved === 7 && seen.move?.where === 'compiled', `cards/move through the binary: ${JSON.stringify(seen.move)}`);
        assert(seen.hello === 'Hello, World!', `hello through the binary: ${JSON.stringify(seen.hello)}`);
        console.log(`  OK   a compiled binary started from another folder answered cards/move and hello (${JSON.stringify(seen)})`);
        return 0;
    } catch (e: any) {
        console.log(`  FAIL ${e.message}`);
        return 1;
    } finally {
        proc?.kill();
        rmSync(work, { recursive: true, force: true });
        rmSync(elsewhere, { recursive: true, force: true });
    }
}

process.exit(await main());
