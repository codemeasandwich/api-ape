/**
 * Scenario runner for api-ape integration tests that drive the REAL browser
 * client against a REAL `Bun.serve` + `apeBun()` server.
 *
 * Why two processes: the browser client is a module-level singleton (one socket,
 * one send queue, one connection state per process), so every scenario needs a
 * fresh client. The runner therefore starts the server in this process and runs
 * the "browser" half of each scenario in a child `bun` process with the browser
 * globals shimmed (`window`, `document`, `location`, `navigator`). The parent
 * sees only what a server operator can see (sockets opened, controller calls),
 * the child sees only what a page developer can see (promises, connection state).
 *
 * A scenario file is both halves: it calls `runScenarios(import.meta.path, ...)`.
 * With no arguments that runs the parent; the parent re-runs the same file as
 * `bun <file> --child <index> <port>` for each scenario's browser half.
 *
 * `APE_ROOT=/path/to/another/checkout` runs the same scenarios against another
 * api-ape checkout (used to prove a scenario fails on the unfixed code).
 *
 * @module integration/bun/scenario-runner
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';

/** Root of the api-ape checkout under test. */
export const ROOT = process.env.APE_ROOT ?? resolve(import.meta.dir, '../..');

/** Marker that prefixes the lines a child prints for the parent to read. */
const MARK = '@@ape@@';

/** What a scenario's browser half can use. */
export interface Browser {
    /** The default export of `api-ape` as a page would import it. */
    api: any;
    /** `api-ape/client/connectSocket`, for scenarios about the lower-level client. */
    connectSocket: any;
    /** Every connection state the page has been told about, in order, with ms since start. */
    states: Array<{ state: string; at: number }>;
    /** Tell the parent something happened; its `onEvent` handler for the name runs. */
    emit: (name: string) => Promise<void>;
    /** Resolve once the connection state equals `state` (or reject after `ms`). */
    waitForState: (state: string, ms?: number) => Promise<number>;
    /** Wait. */
    sleep: (ms: number) => Promise<void>;
    /** The fake page's server port. */
    port: number;
}

/** What a scenario's parent half can use. */
export interface ServerControl {
    port: number;
    /** onConnect calls so far. */
    connects: number;
    /** Close the server and every socket. */
    stop: () => void;
    /** Start the server again on the same port. */
    start: () => void;
    /** Directory the scenario's controller fixtures were written to. */
    dir: string;
}

/** One user story. */
export interface Scenario {
    /** Named as the user story, e.g. "a page that calls five endpoints ...". */
    name: string;
    /** Controller files for the server, `{ 'slow.js': 'module.exports = ...' }`. */
    fixtures: Record<string, string>;
    /** The `selector` option for apeBun. */
    selector?: string[];
    /** Extra apeBun options. */
    apeOptions?: Record<string, any>;
    /** The page's half. Its return value (JSON-able; `undefined` allowed) is handed to `check`. */
    browser: (b: Browser) => Promise<any>;
    /** Server-side reactions to `b.emit(name)`. */
    onEvent?: Record<string, (ctl: ServerControl) => void | Promise<void>>;
    /** Assert on what the page returned and what the server saw. Throw to fail. */
    check: (seen: { result: any; ctl: ServerControl; log: string }) => void | Promise<void>;
    /** Answer some requests yourself before api-ape sees them (e.g. a captive portal's login page). */
    fetch?: (req: Request) => Response | undefined;
    /** Start with the server down; the page starts first and the scenario brings the server up. */
    startDown?: boolean;
    /** Give the child this long before it is killed. Default 20 s. */
    timeoutMs?: number;
}

/** Throw unless `cond`. */
export function assert(cond: unknown, msg: string): asserts cond {
    if (!cond) throw new Error(msg);
}

/** Encode a result so `undefined` and Errors survive the trip over stdout. */
function encode(value: any): string {
    return JSON.stringify(value, (_k, v) => {
        if (v === undefined) return { __undefined: true };
        if (v instanceof Error) {
            const e: any = { __error: true, name: v.name, message: v.message };
            for (const k of Object.keys(v)) e[k] = (v as any)[k];
            return e;
        }
        return v;
    }) ?? '{"__undefined":true}';
}

/** Undo `encode`. */
function decode(text: string): any {
    return JSON.parse(text, (_k, v) => (v && v.__undefined === true ? undefined : v));
}

/**
 * The page's half: shim the browser, import the client, run one scenario.
 *
 * @param scenarios - The scenario table of the file being run
 * @param index - Which scenario
 * @param port - The server port the fake page is "served from"
 */
async function runChild(scenarios: Scenario[], index: number, port: number): Promise<void> {
    const g: any = globalThis;
    g.window = g;
    g.document = { cookie: '' };
    g.location = { protocol: 'http:', hostname: 'localhost', port: String(port), host: `localhost:${port}` };
    g.navigator = { onLine: true };
    g.addEventListener = () => {};

    const started = Date.now();
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    const api: any = (await import(resolve(ROOT, 'client/index.js'))).default;
    const connectSocket: any = (await import(resolve(ROOT, 'client/connectSocket.js'))).default;
    const states: Browser['states'] = [];
    api.onConnectionChange((state: string) => states.push({ state, at: Date.now() - started }));

    const acks = new Map<string, () => void>();
    const reader = (async () => {
        // The parent answers each emit with a line on stdin.
        const decoder = new TextDecoder();
        let buffer = '';
        for await (const chunk of Bun.stdin.stream()) {
            buffer += decoder.decode(chunk);
            let nl;
            while ((nl = buffer.indexOf('\n')) >= 0) {
                const name = buffer.slice(0, nl);
                buffer = buffer.slice(nl + 1);
                acks.get(name)?.();
            }
        }
    })();
    void reader;

    const browser: Browser = {
        api, connectSocket, states, sleep, port,
        emit: (name) => new Promise<void>((res) => {
            acks.set(name, res);
            console.log(`${MARK}event ${name}`);
        }),
        waitForState: async (state, ms = 15000) => {
            const t = Date.now();
            while (Date.now() - t < ms) {
                if (states.length && states[states.length - 1].state === state) return Date.now() - t;
                await sleep(20);
            }
            throw new Error(`never reached state "${state}" (saw ${states.map((s) => s.state).join(',')})`);
        },
    };

    let result: any;
    try {
        result = await scenarios[index].browser(browser);
    } catch (e: any) {
        result = { __page_threw: { name: e?.name, message: e?.message } };
    }
    console.log(`${MARK}result ${encode({ result, states })}`);
    process.exit(0);
}

/**
 * Run every scenario in the file as the parent, or one as the child.
 *
 * @param file - `import.meta.path` of the scenario file
 * @param title - Heading printed before the scenarios
 * @param scenarios - The scenario table
 */
export async function runScenarios(file: string, title: string, scenarios: Scenario[]): Promise<void> {
    const childAt = process.argv.indexOf('--child');
    if (childAt >= 0) {
        await runChild(scenarios, Number(process.argv[childAt + 1]), Number(process.argv[childAt + 2]));
        return;
    }

    const { apeBun } = await import(resolve(ROOT, 'server/lib/bun.js'));
    (await import(resolve(ROOT, 'utils/apeLogger.js'))).configureApeLogging(false); // framework chatter off
    console.log(`${title} (Bun ${Bun.version})`);
    let failures = 0;
    const only = process.env.ONLY;

    for (let index = 0; index < scenarios.length; index++) {
        const scenario = scenarios[index];
        if (only && !scenario.name.includes(only)) continue;
        const started = Date.now();
        const dir = mkdtempSync(join(tmpdir(), 'ape-scenario-'));
        for (const [name, source] of Object.entries(scenario.fixtures)) {
            mkdirSync(dirname(join(dir, name)), { recursive: true });
            writeFileSync(join(dir, name), source);
        }
        let connects = 0;
        const ape = apeBun({
            where: dir, urlPrefix: 'api', selector: scenario.selector,
            ...scenario.apeOptions,
            onConnect: () => { connects++; return {}; },
        });
        const boot = (port: number) => Bun.serve({
            port,
            fetch(req, srv) { return scenario.fetch?.(req) ?? ape.fetch(req, srv) ?? new Response('not found', { status: 404 }); },
            websocket: ape.websocket,
        });
        let server = boot(0);
        const port = server.port;
        const ctl: ServerControl = {
            port, dir,
            get connects() { return connects; },
            stop: () => server.stop(true),
            start: () => { server = boot(port); },
        };

        if (scenario.startDown) server.stop(true);

        let log = '';
        const child = Bun.spawn(['bun', file, '--child', String(index), String(port)], {
            env: { ...process.env, APE_ROOT: ROOT },
            stdin: 'pipe', stdout: 'pipe', stderr: 'pipe',
        });
        const killer = setTimeout(() => child.kill(), scenario.timeoutMs ?? 20000);
        let payload: string | undefined;
        const decoder = new TextDecoder();
        let buffer = '';
        for await (const chunk of child.stdout as any) {
            buffer += decoder.decode(chunk);
            let nl;
            while ((nl = buffer.indexOf('\n')) >= 0) {
                const line = buffer.slice(0, nl);
                buffer = buffer.slice(nl + 1);
                if (line.startsWith(`${MARK}event `)) {
                    const name = line.slice(`${MARK}event `.length);
                    await scenario.onEvent?.[name]?.(ctl);
                    child.stdin!.write(`${name}\n`);
                    child.stdin!.flush();
                } else if (line.startsWith(`${MARK}result `)) {
                    payload = line.slice(`${MARK}result `.length);
                } else {
                    log += line + '\n';
                }
            }
        }
        clearTimeout(killer);
        await child.exited;

        try {
            assert(payload !== undefined, `the page never finished (killed after ${scenario.timeoutMs ?? 20000} ms); child log:\n${log.slice(-600)}`);
            const seen = decode(payload!);
            assert(!seen.result?.__page_threw, `the page threw: ${JSON.stringify(seen.result?.__page_threw)}`);
            await scenario.check({ result: seen.result, ctl, log });
            console.log(`  OK   ${scenario.name} (${Date.now() - started}ms)`);
        } catch (e: any) {
            failures++;
            console.log(`  FAIL ${scenario.name}\n       ${String(e.message).replace(/\n/g, '\n       ')}`);
        } finally {
            server.stop(true);
            ape.close();
            rmSync(dir, { recursive: true, force: true });
        }
    }
    process.exit(failures > 0 ? 1 : 0);
}
