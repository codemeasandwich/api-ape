/**
 * Shared Test Runner
 *
 * Provides a consistent way to run integration test scenarios
 * across different runtimes.
 */

/**
 * Run all test scenarios
 *
 * @param {Object} options
 * @param {string} options.runtime - Runtime name for display
 * @param {Object} options.server - Server instance with { port, apiPath }
 * @param {Function} options.WebSocket - WebSocket constructor
 * @param {Function} options.Buffer - Buffer constructor (or polyfill)
 * @param {Array} options.scenarios - Test scenarios to run
 * @returns {Promise<{passed: number, failed: number, results: Array}>}
 */
async function runScenarios({ runtime, server, WebSocket, Buffer, scenarios }) {
    console.log(`\n${'═'.repeat(50)}`);
    console.log(`Running Integration Tests: ${runtime}`);
    console.log(`Server: http://localhost:${server.port}/${server.apiPath}`);
    console.log(`${'═'.repeat(50)}\n`);

    const results = [];
    let passed = 0;
    let failed = 0;

    // Simple assertion helper
    const expect = (actual) => ({
        toBe: (expected) => {
            if (actual !== expected) {
                throw new Error(`Expected ${expected}, got ${actual}`);
            }
        },
        toBeDefined: () => {
            if (actual === undefined) {
                throw new Error('Expected value to be defined');
            }
        },
        toBeTruthy: () => {
            if (!actual) {
                throw new Error(`Expected truthy value, got ${actual}`);
            }
        },
        toEqual: (expected) => {
            if (JSON.stringify(actual) !== JSON.stringify(expected)) {
                throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
            }
        }
    });

    for (const scenario of scenarios) {
        const startTime = Date.now();
        try {
            await scenario.run({ server, WebSocket, Buffer, expect });
            const duration = Date.now() - startTime;
            console.log(`  ✓ ${scenario.name} (${duration}ms)`);
            passed++;
            results.push({ name: scenario.name, passed: true, duration });
        } catch (error) {
            const duration = Date.now() - startTime;
            console.log(`  ✗ ${scenario.name} (${duration}ms)`);
            console.log(`    Error: ${error.message}`);
            failed++;
            results.push({ name: scenario.name, passed: false, duration, error: error.message });
        }
    }

    console.log(`\n${'─'.repeat(50)}`);
    console.log(`Results: ${passed} passed, ${failed} failed`);
    console.log(`${'─'.repeat(50)}\n`);

    return { passed, failed, results };
}

module.exports = { runScenarios };
