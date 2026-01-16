/**
 * @fileoverview File Actions - Atomic operations for file transfers
 *
 * These actions handle binary file transfers through api-ape's public interface:
 * - Upload: Client sends binary data to server via controller
 * - Download: Server returns binary data to client
 * - Client-to-client: File sharing via broadcasts with <!F> tags
 *
 * All operations execute instantly in the virtual environment (no network delay).
 *
 * @module simulator/scenarios/actions/files
 *
 * @example
 * const files = require('../actions/files')
 *
 * // Upload a file
 * const result = await files.upload({
 *   client,
 *   endpoint: 'files/upload',
 *   filename: 'test.png',
 *   data: Buffer.from([0x89, 0x50, 0x4E, 0x47])
 * })
 *
 * // Download a file
 * const { data, filename } = await files.download({
 *   client,
 *   endpoint: 'files/download',
 *   filename: 'test.png'
 * })
 */

module.exports = {
  // Upload operations
  upload: require('./upload'),
  uploadMany: require('./uploadMany'),

  // Download operations
  download: require('./download'),
  downloadAndVerify: require('./downloadAndVerify'),

  // Round-trip testing
  roundTrip: require('./roundTrip'),

  // Client-to-client sharing
  share: require('./share'),
  downloadShared: require('./downloadShared'),

  // Test data generation
  createTestData: require('./createTestData'),
  createTypedTestFile: require('./createTypedTestFile'),

  // Assertions
  assertDataEquals: require('./assertDataEquals'),
  assertSize: require('./assertSize'),
};
