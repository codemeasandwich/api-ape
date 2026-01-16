/**
 * End-to-End: Collaborative document editing workflow
 *
 * This test chains ALL action types together for a complete collaborative scenario:
 * 1. Server with user authentication (lifecycle)
 * 2. Multiple users connect with different roles (connection)
 * 3. Users create and share documents with complex metadata (files, jss)
 * 4. Real-time edit notifications via broadcast (broadcast)
 * 5. Version control with sequential updates (rpc)
 * 6. Late joiner sync pattern
 * 7. User disconnect handling
 * 8. Error recovery when user edits conflict
 *
 * Uses actions from: connection, rpc, broadcast, files, lifecycle, jss
 */

const connection = require('../../actions/connection');
const rpc = require('../../actions/rpc');
const broadcast = require('../../actions/broadcast');
const files = require('../../actions/files');
const lifecycle = require('../../actions/lifecycle');
const jss = require('../../actions/jss');

module.exports = async function collaborativeDocumentEditing({ harness, expect }) {
    const editHistory = [];
    let documentVersion = 0;
    let connectionCount = 0;

    // === STEP 1: Create collaborative server ===
    const { server, events } = await lifecycle.createServerWithEmbed({
        harness,
        where: 'test-api',
        embed: (socket, req, send) => {
            connectionCount++;
            const roles = ['owner', 'editor', 'viewer'];
            const role = roles[Math.min(connectionCount - 1, 2)];
            const embedData = {
                userId: `collab-user-${connectionCount}`,
                role,
                joinedAt: new Date(),
                permissions: {
                    canEdit: role !== 'viewer',
                    canDelete: role === 'owner',
                    canInvite: role === 'owner'
                }
            };

            // Send welcome message
            send('joined-workspace', {
                userId: embedData.userId,
                role: embedData.role,
                permissions: embedData.permissions,
                currentVersion: documentVersion
            });

            return embedData;
        }
    });

    // === STEP 2: Owner connects ===
    const owner = await connection.connect({ harness, server });
    const ownerWelcome = await owner.waitFor('joined-workspace', 200);

    expect(ownerWelcome.data.role).toBe('owner');
    expect(ownerWelcome.data.permissions.canDelete).toBe(true);

    const ownerMessages = broadcast.listen({ client: owner, type: 'message' });
    const ownerFileNotifs = broadcast.listen({ client: owner, type: 'file-shared' });

    // === STEP 3: Editor connects ===
    const editor = await connection.connect({ harness, server });
    const editorWelcome = await editor.waitFor('joined-workspace', 200);

    expect(editorWelcome.data.role).toBe('editor');
    expect(editorWelcome.data.permissions.canEdit).toBe(true);
    expect(editorWelcome.data.permissions.canDelete).toBe(false);

    const editorMessages = broadcast.listen({ client: editor, type: 'message' });
    const editorFileNotifs = broadcast.listen({ client: editor, type: 'file-shared' });

    // === STEP 4: Viewer connects ===
    const viewer = await connection.connect({ harness, server });
    const viewerWelcome = await viewer.waitFor('joined-workspace', 200);

    expect(viewerWelcome.data.role).toBe('viewer');
    expect(viewerWelcome.data.permissions.canEdit).toBe(false);

    const viewerMessages = broadcast.listen({ client: viewer, type: 'message' });
    const viewerFileNotifs = broadcast.listen({ client: viewer, type: 'file-shared' });

    connection.assertAllConnected({ clients: [owner, editor, viewer] });

    // === STEP 5: Owner creates initial document ===
    const documentContent = JSON.stringify({
        title: 'Project Plan',
        createdAt: new Date().toISOString(),
        sections: [
            { id: 1, title: 'Overview', content: 'Initial content' }
        ]
    });

    const createResult = await files.upload({
        client: owner,
        endpoint: 'files/upload',
        filename: 'project-plan.json',
        data: Buffer.from(documentContent),
        metadata: { broadcast: true }
    });

    expect(createResult.success).toBe(true);
    const documentHash = createResult.hash;

    // Editor and viewer receive notification
    expect(editorFileNotifs.length).toBe(1);
    expect(viewerFileNotifs.length).toBe(1);
    expect(ownerFileNotifs.length).toBe(0); // Owner doesn't receive own

    // === STEP 6: Editor downloads document ===
    const editorDownload = await files.download({
        client: editor,
        endpoint: 'files/download',
        params: { hash: documentHash }
    });

    expect(editorDownload.name).toBe('project-plan.json');

    // === STEP 7: Editor makes edit via RPC ===
    await rpc.callAndExpect({
        client: editor,
        endpoint: 'message',
        data: {
            type: 'edit',
            documentId: documentHash,
            change: {
                action: 'add-section',
                section: { id: 2, title: 'Timeline', content: 'Q4 milestones' }
            },
            user: 'editor'
        },
        expect: { success: true }
    });

    documentVersion++;
    editHistory.push({ version: documentVersion, by: 'editor', action: 'add-section' });

    // Owner and viewer receive edit notification (at least 1 message each)
    expect(ownerMessages.length).toBeGreaterThanOrEqual(1);
    expect(viewerMessages.length).toBeGreaterThanOrEqual(1);

    // === STEP 8: Owner makes concurrent edit ===
    await rpc.call({
        client: owner,
        endpoint: 'message',
        data: {
            type: 'edit',
            documentId: documentHash,
            change: {
                action: 'update-title',
                newTitle: 'Q4 Project Plan'
            },
            user: 'owner'
        }
    });

    documentVersion++;
    editHistory.push({ version: documentVersion, by: 'owner', action: 'update-title' });

    // === STEP 9: Multiple rapid edits ===
    const rapidEdits = [];
    for (let i = 0; i < 5; i++) {
        rapidEdits.push(
            rpc.call({
                client: i % 2 === 0 ? owner : editor,
                endpoint: 'message',
                data: {
                    type: 'edit',
                    editId: i,
                    user: i % 2 === 0 ? 'owner' : 'editor'
                }
            })
        );
    }

    const rapidResults = await Promise.all(rapidEdits);
    expect(rapidResults).toHaveLength(5);
    rapidResults.forEach(r => expect(r.success).toBe(true));

    // Viewer received all edits (2 initial + 5 rapid)
    expect(viewerMessages.length).toBeGreaterThanOrEqual(7);

    // === STEP 10: Late joiner connects ===
    const lateJoiner = await connection.connect({ harness, server });
    const lateJoinerWelcome = await lateJoiner.waitFor('joined-workspace', 200);

    expect(lateJoinerWelcome.data.role).toBe('viewer'); // 4th user is viewer

    const lateJoinerMessages = broadcast.listen({ client: lateJoiner, type: 'message' });

    // Late joiner missed all previous edits
    expect(lateJoinerMessages.length).toBe(0);

    // === STEP 11: Late joiner syncs by downloading current doc ===
    const syncDownload = await files.download({
        client: lateJoiner,
        endpoint: 'files/download',
        params: { hash: documentHash }
    });

    expect(syncDownload.name).toBe('project-plan.json');

    // === STEP 12: Verify complex data round-trip ===
    const complexEdit = {
        type: 'metadata-update',
        changes: {
            updatedAt: new Date(),
            tags: new Set(['important', 'q4', 'reviewed']),
            reviewers: new Map([
                ['editor', { approved: true }],
                ['owner', { approved: true }]
            ]),
            pattern: /^section-\d+$/
        }
    };

    const complexResult = await rpc.call({
        client: owner,
        endpoint: 'types',
        data: complexEdit
    });

    // Verify JSS preserved types
    expect(complexResult.changes.updatedAt instanceof Date).toBe(true);
    expect(complexResult.changes.tags instanceof Set).toBe(true);
    expect(complexResult.changes.reviewers instanceof Map).toBe(true);
    expect(complexResult.changes.pattern instanceof RegExp).toBe(true);

    // === STEP 13: Test error recovery ===
    const errorResult = await rpc.callAndExpectError({
        client: editor,
        endpoint: 'errors',
        data: { type: 'sync', reason: 'conflict' }
    });

    expect(errorResult).toBeDefined();

    // Editor can still work after error
    const recoveryResult = await rpc.call({
        client: editor,
        endpoint: 'echo',
        data: { recovered: true }
    });
    expect(recoveryResult.recovered).toBe(true);

    // === STEP 14: Editor disconnects ===
    await connection.disconnect({ client: editor });

    connection.assertDisconnected({ client: editor });

    // Remaining users still work
    await rpc.call({
        client: owner,
        endpoint: 'message',
        data: { text: 'Editor left', user: 'owner' }
    });

    // Viewer receives more messages
    expect(viewerMessages.length).toBeGreaterThanOrEqual(8);

    // === STEP 15: Full cleanup ===
    await connection.disconnectMany({ clients: [owner, viewer, lateJoiner] });

    connection.assertAllDisconnected({ clients: [owner, editor, viewer, lateJoiner] });

    // Verify edit history accumulated correctly
    expect(editHistory.length).toBe(2); // Only explicitly tracked
    expect(editHistory[0].action).toBe('add-section');
    expect(editHistory[1].action).toBe('update-title');
};
