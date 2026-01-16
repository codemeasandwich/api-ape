/**
 * Complete journey: User sees errors thrown by controllers
 */
module.exports = async function userSeesControllerThrownErrors({ harness, expect }) {
    const server = await harness.createServer({ where: 'test-api' });
    const client = await harness.createClientForServer(server);

    // Controller throws an error
    await expect(
        client.call('errors', { type: 'generic', message: 'Bad input' })
    ).rejects.toThrow('Bad input');

    await client.disconnect();
};
