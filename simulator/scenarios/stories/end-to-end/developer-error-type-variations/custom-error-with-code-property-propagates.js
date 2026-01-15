/**
 * User encounters custom error with error code
 */
module.exports = async function customErrorWithCodePropertyPropagates({ harness, expect }) {
    const server = await harness.createServer({ where: 'test-api' });
    const client = await harness.createClientForServer(server);

    try {
        await client.call('errors', {
            type: 'custom',
            message: 'Invalid configuration',
            details: { field: 'apiKey' }
        });
        expect(true).toBe(false); // Should not reach here
    } catch (err) {
        expect(err.message).toContain('Invalid configuration');
    }

    await client.disconnect();
};
