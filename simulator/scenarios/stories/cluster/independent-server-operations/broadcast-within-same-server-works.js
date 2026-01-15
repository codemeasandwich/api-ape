/**
 * Test: broadcast within same server works
 */
module.exports = async function broadcastWithinSameServerWorks({ harness, expect }) {
    const servers = await harness.createCluster(2, { where: 'test-api' });

    // Two clients on server 1
    const client1a = await harness.createClientForServer(servers[0]);
    const client1b = await harness.createClientForServer(servers[0]);

    const received = [];
    client1b.on('message', (msg) => received.push(msg));

    await client1a.call('message', { text: 'Hello same server!' });
    await harness.wait(20);

    expect(received.length).toBe(1);
    expect(received[0].data.text).toBe('Hello same server!');
};
