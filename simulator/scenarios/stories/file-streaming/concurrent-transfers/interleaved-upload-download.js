/**
 * Test: interleaved upload and download
 *
 * Tests that uploads and downloads can happen concurrently
 * without interfering with each other.
 */
module.exports = async function interleavedUploadDownload({ harness, expect }) {
  const { clients } = await harness.createGroup(2, { where: 'test-api' });
  const [uploader, downloader] = clients;

  // First, upload some initial files
  const initialFiles = [
    { name: 'initial1.txt', data: Buffer.from('Initial file 1 content') },
    { name: 'initial2.txt', data: Buffer.from('Initial file 2 content') }
  ];

  const initialResults = await Promise.all(
    initialFiles.map(file =>
      uploader.call('files/upload', {
        name: file.name,
        data: file.data,
        broadcast: false
      }, 3000)
    )
  );

  // Now interleave uploads and downloads
  const newUpload = uploader.call('files/upload', {
    name: 'new-upload.txt',
    data: Buffer.from('New upload during downloads'),
    broadcast: false
  }, 3000);

  const download1 = downloader.call('files/download', {
    hash: initialResults[0].hash
  }, 3000);

  const download2 = downloader.call('files/download', {
    hash: initialResults[1].hash
  }, 3000);

  const [uploadResult, downloadResult1, downloadResult2] = await Promise.all([
    newUpload,
    download1,
    download2
  ]);

  // Verify upload succeeded
  expect(uploadResult.success).toBe(true);
  expect(uploadResult.name).toBe('new-upload.txt');

  // Verify downloads succeeded
  expect(downloadResult1.name).toBe('initial1.txt');
  expect(downloadResult2.name).toBe('initial2.txt');
};
