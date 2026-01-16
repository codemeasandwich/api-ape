/**
 * Test: rapid sequential messages all delivered
 */
module.exports = async function rapidSequentialMessagesAllDelivered({ harness, expect }) {
    const { clients } = await harness.createGroup(3, { where: 'test-api' });
    const [sender, ...receivers] = clients;

    const receivedMessages = receivers.map(() => []);
    receivers.forEach((client, i) => {
        client.on('message', (msg) => receivedMessages[i].push(msg));
    });

    // Send 10 rapid messages
    for (let i = 0; i < 10; i++) {
        await sender.call('message', { text: `Message ${i}` });
    }

    await harness.wait(100);

    // Each receiver should get all 10 messages
    for (const messages of receivedMessages) {
        expect(messages.length).toBe(10);
    }
};
