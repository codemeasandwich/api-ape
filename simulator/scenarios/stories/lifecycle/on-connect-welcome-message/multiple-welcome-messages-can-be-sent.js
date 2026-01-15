/**
 * Test: multiple welcome messages can be sent
 */
module.exports = async function multipleWelcomeMessagesCanBeSent({ harness, expect }) {
    const server = await harness.createServer({
        where: 'test-api',
        onConnect: (socket, req, send) => {
            send('status', { online: true });
            send('config', { version: '1.0' });
            return { embed: {} };
        }
    });

    const client = await harness.createClientForServer(server);

    const status = await client.waitFor('status', 200);
    const config = await client.waitFor('config', 200);

    expect(status.data.online).toBe(true);
    expect(config.data.version).toBe('1.0');
};
