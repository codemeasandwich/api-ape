/**
 * Multiple messages in quick succession
 */
module.exports = async function burstOfMessagesAllDelivered({ harness, expect }) {
    const server = await harness.createServer({ where: 'test-api' });

    const sender = await harness.createClientForServer(server);
    const receiver = await harness.createClientForServer(server);

    const received = [];
    receiver.on('message', (msg) => received.push(msg));

    // Send 5 messages as fast as possible
    await Promise.all([
        sender.call('message', { text: 'msg-0' }),
        sender.call('message', { text: 'msg-1' }),
        sender.call('message', { text: 'msg-2' }),
        sender.call('message', { text: 'msg-3' }),
        sender.call('message', { text: 'msg-4' })
    ]);

    await harness.wait(50);

    expect(received.length).toBe(5);

    await sender.disconnect();
    await receiver.disconnect();
};
