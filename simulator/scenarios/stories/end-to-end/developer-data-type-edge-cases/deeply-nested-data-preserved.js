/**
 * User sends deeply nested data
 */
module.exports = async function deeplyNestedDataPreserved({ harness, expect }) {
    const server = await harness.createServer({ where: 'test-api' });
    const client = await harness.createClientForServer(server);

    const deepData = {
        level1: {
            level2: {
                level3: {
                    level4: {
                        level5: {
                            value: 'deep!'
                        }
                    }
                }
            }
        }
    };

    const result = await client.call('echo', deepData);
    expect(result.level1.level2.level3.level4.level5.value).toBe('deep!');

    await client.disconnect();
};
