/**
 * User encounters validation error
 */
module.exports = async function validationErrorWithFieldInfoPropagates({ harness, expect }) {
    const server = await harness.createServer({ where: 'test-api' });
    const client = await harness.createClientForServer(server);

    try {
        await client.call('errors', {
            type: 'validation',
            message: 'Email is invalid',
            field: 'email'
        });
        expect(true).toBe(false);
    } catch (err) {
        expect(err.message).toContain('Email is invalid');
    }

    await client.disconnect();
};
