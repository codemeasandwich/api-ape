/**
 * Test: waitFor times out when no message arrives
 */
module.exports = async function waitForTimesOutWhenNoMessage({ harness, expect }) {
    const { client } = await harness.createPair({ where: 'test-api' });

    await expect(client.waitFor('nonexistent', 50)).rejects.toThrow(
        'Timeout'
    );
};
