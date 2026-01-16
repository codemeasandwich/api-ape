/**
 * Test: onDisconnect fires when client disconnects
 */
module.exports = async function onDisconnectFiresWhenClientDisconnects({ harness, expect }) {
    let disconnectCalled = false;
    let disconnectedClientId = null;

    const server = await harness.createServer({
        where: 'test-api',
        onConnect: (socket, req, send) => ({
            embed: { userId: 'test-user' },
            onDisconnect: () => {
                disconnectCalled = true;
                // Note: can't easily get clientId here without storing it
            }
        })
    });

    const client = await harness.createClientForServer(server);
    expect(disconnectCalled).toBe(false);

    await client.disconnect();
    await harness.wait(20);

    expect(disconnectCalled).toBe(true);
};
