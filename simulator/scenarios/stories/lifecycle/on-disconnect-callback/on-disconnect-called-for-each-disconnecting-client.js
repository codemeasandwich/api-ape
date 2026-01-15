/**
 * Test: onDisconnect called for each disconnecting client
 */
module.exports = async function onDisconnectCalledForEachDisconnectingClient({ harness, expect }) {
    let disconnectCount = 0;

    const server = await harness.createServer({
        where: 'test-api',
        onConnect: (socket, req, send) => ({
            embed: {},
            onDisconnect: () => {
                disconnectCount++;
            }
        })
    });

    const client1 = await harness.createClientForServer(server);
    const client2 = await harness.createClientForServer(server);
    const client3 = await harness.createClientForServer(server);

    await client1.disconnect();
    await client2.disconnect();
    await harness.wait(30);

    expect(disconnectCount).toBe(2);

    await client3.disconnect();
    await harness.wait(20);

    expect(disconnectCount).toBe(3);
};
