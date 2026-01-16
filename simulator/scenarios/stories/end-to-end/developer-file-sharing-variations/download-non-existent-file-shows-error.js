/**
 * User downloads file that doesn't exist
 */
module.exports = async function downloadNonExistentFileShowsError({ harness, expect }) {
    const server = await harness.createServer({ where: 'test-api' });
    const client = await harness.createClientForServer(server);

    await expect(
        client.call('files/download', { hash: 'nonexistent-hash-xyz' })
    ).rejects.toThrow('not found');

    // Client still connected
    expect(client.connected).toBe(true);

    await client.disconnect();
};
