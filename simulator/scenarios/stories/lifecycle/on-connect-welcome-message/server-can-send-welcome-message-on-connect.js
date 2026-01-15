/**
 * Test: server can send welcome message on connect
 */
module.exports = async function serverCanSendWelcomeMessageOnConnect({ harness, expect }) {
    const server = await harness.createServer({
        where: 'test-api',
        onConnect: (socket, req, send) => {
            // Send welcome message to newly connected client
            send('welcome', { message: 'Welcome!', serverTime: new Date() });
            return { embed: {} };
        }
    });

    const client = await harness.createClientForServer(server);

    // Wait for welcome message
    const welcome = await client.waitFor('welcome', 200);

    expect(welcome.data.message).toBe('Welcome!');
};
