/**
 * Complete journey: User navigates deep API structure
 *
 * Steps:
 * 1. Server with nested controllers
 * 2. User connects
 * 3. User calls shallow route (api.users())
 * 4. User calls nested route (api.users.profile())
 * 5. User calls deep route (api.nested.deep.handler())
 * 6. All return correct data
 */
module.exports = async function userCallsApisAtDifferentNestingLevels({ harness, expect }) {
    // === STEP 1: Server starts ===
    const server = await harness.createServer({ where: 'test-api' });

    // === STEP 2: User connects ===
    const client = await harness.createClientForServer(server);

    // === STEP 3: Shallow route ===
    const usersResult = await client.call('users', {});
    expect(usersResult.users).toBeDefined();
    expect(Array.isArray(usersResult.users)).toBe(true);

    // === STEP 4: Nested route ===
    const profileResult = await client.call('users/profile', { id: 123 });
    expect(profileResult.requestedId).toBe(123);
    expect(profileResult.profile).toBeDefined();

    // === STEP 5: Deep route (3 levels) ===
    const deepResult = await client.call('nested/deep/handler', {
        message: 'Deep call!'
    });
    expect(deepResult.depth).toBe(3);
    expect(deepResult.message).toBe('Deep call!');

    // === STEP 6: Very deep route (4 levels) ===
    const veryDeepResult = await client.call('nested/deep/very/handler', {});
    expect(veryDeepResult.depth).toBe(4);

    // Cleanup
    await client.disconnect();
};
