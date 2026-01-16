/**
 * User uploads and shares file with broadcast notification
 */
module.exports = async function fileUploadWithBroadcastToOthers({ harness, expect }) {
    const server = await harness.createServer({ where: 'test-api' });

    const alice = await harness.createClientForServer(server);
    const bob = await harness.createClientForServer(server);

    const bobNotifications = [];
    bob.on('file-shared', (msg) => bobNotifications.push(msg));

    // Alice uploads (broadcast: true by default)
    await alice.call('files/upload', {
        name: 'shared-photo.jpg',
        data: Buffer.from('photo data here')
    });

    await harness.wait(30);

    // Bob should be notified
    expect(bobNotifications.length).toBe(1);
    expect(bobNotifications[0].data.name).toBe('shared-photo.jpg');

    await alice.disconnect();
    await bob.disconnect();
};
