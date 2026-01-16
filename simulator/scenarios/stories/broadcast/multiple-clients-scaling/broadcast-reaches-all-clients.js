/**
 * Test: broadcast reaches all 10 clients
 */
module.exports = async function broadcastReachesAllClients({ harness, expect }) {
    const { server, clients } = await harness.createGroup(10, {
        where: 'test-api'
    });

    const receivedCounts = clients.map(() => ({ count: 0 }));

    clients.forEach((client, i) => {
        client.on('message', () => {
            receivedCounts[i].count++;
        });
    });

    // First client sends a message
    await clients[0].call('message', { text: 'Hello all!' });

    await harness.wait(50);

    // Sender (index 0) should not receive
    expect(receivedCounts[0].count).toBe(0);

    // All others should receive exactly 1 message
    for (let i = 1; i < 10; i++) {
        expect(receivedCounts[i].count).toBe(1);
    }
};
