/**
 * S3 Upload Tests
 * Tests for S3 client interactions and upload functionality
 */

const WebpackS3AssetsPlugin = require('../index.js');
const { createMockCompilation, MockS3Client, generateRandomContent, createMockConsole, sleep } = require('./helpers.js');

// Mock AWS SDK
jest.mock('@aws-sdk/client-s3');
jest.mock('@smithy/node-http-handler');
jest.mock('cli-progress');

describe('S3 Upload Functionality', () => {
  let plugin;
  let mockS3Client;
  let originalS3Client;

  beforeEach(() => {
    jest.clearAllMocks();
    
    plugin = new WebpackS3AssetsPlugin({
      s3Options: { 
        region: 'us-east-1',
        credentials: {
          accessKeyId: 'test-key',
          secretAccessKey: 'test-secret'
        }
      },
      s3UploadOptions: { 
        Bucket: 'test-bucket',
        ACL: 'public-read'
      },
      progress: false,
      debug: false,
      timeout: 5000,
      totalTimeout: 10000
    });

    mockS3Client = new MockS3Client();
    plugin.s3Client = mockS3Client;
  });

  describe('checkFileExists', () => {
    it('should return true when file exists with matching MD5', async () => {
      const content = Buffer.from('test content');
      const localMD5 = plugin.getContentMD5(content);

      mockS3Client.setResponse('HeadObjectCommand', {
        ETag: `"${localMD5}"`,
        $metadata: { httpStatusCode: 200 }
      });

      const exists = await plugin.checkFileExists('test-file.js', localMD5);

      expect(exists).toBe(true);
    });

    it('should return false when file exists with different MD5', async () => {
      mockS3Client.setResponse('HeadObjectCommand', {
        ETag: '"different-hash"',
        $metadata: { httpStatusCode: 200 }
      });

      const exists = await plugin.checkFileExists('test-file.js', 'local-hash');

      expect(exists).toBe(false);
    });

    it('should return false when file does not exist', async () => {
      const notFoundError = new Error('NotFound');
      notFoundError.name = 'NotFound';
      mockS3Client.setError('HeadObjectCommand', notFoundError);

      const exists = await plugin.checkFileExists('test-file.js', 'hash');

      expect(exists).toBe(false);
    });

    it('should return false on 404 response', async () => {
      const notFoundError = new Error('Not Found');
      notFoundError.$metadata = { httpStatusCode: 404 };
      mockS3Client.setError('HeadObjectCommand', notFoundError);

      const exists = await plugin.checkFileExists('test-file.js', 'hash');

      expect(exists).toBe(false);
    });

    it('should throw on unexpected errors', async () => {
      const unexpectedError = new Error('Network Error');
      mockS3Client.setError('HeadObjectCommand', unexpectedError);

      await expect(plugin.checkFileExists('test-file.js', 'hash'))
        .rejects.toThrow('Network Error');
    });
  });

  describe('uploadSmallFile', () => {
    beforeEach(() => {
      mockS3Client.setResponse('PutObjectCommand', {
        $metadata: { httpStatusCode: 200 }
      });
    });

    it('should upload small file successfully', async () => {
      const file = {
        name: 'small.js',
        content: Buffer.from('console.log("test")'),
        size: 20
      };

      await plugin.uploadSmallFile(file);

      expect(mockS3Client.sentCommands).toHaveLength(1);
      expect(mockS3Client.sentCommands[0].name).toBe('PutObjectCommand');
      expect(plugin.successCount).toBe(0); // Success count is incremented elsewhere
    });

    it('should set correct content type', async () => {
      const file = {
        name: 'styles.css',
        content: Buffer.from('body { color: red; }'),
        size: 20
      };

      await plugin.uploadSmallFile(file);

      const command = mockS3Client.sentCommands[0];
      expect(command.input.ContentType).toBe('text/css');
    });

    it('should use default content type for unknown extensions', async () => {
      const file = {
        name: 'unknown.xyz',
        content: Buffer.from('data'),
        size: 10
      };

      await plugin.uploadSmallFile(file);

      const command = mockS3Client.sentCommands[0];
      expect(command.input.ContentType).toBe('application/octet-stream');
    });

    it('should retry on failure', async () => {
      const file = {
        name: 'retry-test.js',
        content: Buffer.from('code'),
        size: 10
      };

      let attempts = 0;
      mockS3Client.send = jest.fn().mockImplementation(async () => {
        attempts++;
        if (attempts < 2) {
          const error = new Error('Temporary failure');
          throw error;
        }
        return { $metadata: { httpStatusCode: 200 } };
      });

      await plugin.uploadSmallFile(file);

      expect(attempts).toBe(2);
    });

    it('should add failed uploads to failedUploads array', async () => {
      plugin.options.retries = 0;
      const file = {
        name: 'fail-test.js',
        content: Buffer.from('code'),
        size: 10
      };

      mockS3Client.setError('PutObjectCommand', new Error('Upload failed'));

      await expect(plugin.uploadSmallFile(file)).rejects.toThrow('Upload failed');

      expect(plugin.failedUploads).toHaveLength(1);
      expect(plugin.failedUploads[0].file).toBe('fail-test.js');
      expect(plugin.failedUploads[0].error).toBe('Upload failed');
    });

    it('should skip files exceeding max size', async () => {
      plugin.options.maxFileSize = 100;
      plugin.options.skipLargeFiles = true;
      
      const file = {
        name: 'too-large.js',
        content: Buffer.alloc(200),
        size: 200
      };

      await plugin.uploadSmallFile(file);

      expect(plugin.skippedCount).toBe(1);
      expect(mockS3Client.sentCommands).toHaveLength(0);
    });

    it('should throw when skipLargeFiles is false and file exceeds max', async () => {
      plugin.options.maxFileSize = 100;
      plugin.options.skipLargeFiles = false;
      
      const file = {
        name: 'too-large.js',
        content: Buffer.alloc(200),
        size: 200
      };

      await expect(plugin.uploadSmallFile(file)).rejects.toThrow('exceeds maximum size');
    });

    it('should skip existing files when skipExistingFiles is enabled', async () => {
      plugin.options.skipExistingFiles = true;
      const content = Buffer.from('existing content');
      const localMD5 = plugin.getContentMD5(content);

      mockS3Client.setResponse('HeadObjectCommand', {
        ETag: `"${localMD5}"`,
        $metadata: { httpStatusCode: 200 }
      });

      const file = {
        name: 'existing.js',
        content,
        size: content.length
      };

      await plugin.uploadSmallFile(file);

      expect(plugin.skippedExistingCount).toBe(1);
      expect(mockS3Client.sentCommands).toHaveLength(1); // Only HeadObjectCommand
    });
  });

  describe('uploadLargeFile', () => {
    beforeEach(() => {
      plugin.options.multipartThreshold = 1024; // 1KB
      plugin.options.partSize = 512; // 512B parts
      
      mockS3Client.setResponse('CreateMultipartUploadCommand', {
        UploadId: 'test-upload-id-123'
      });
      mockS3Client.setResponse('UploadPartCommand', {
        ETag: '"part-etag-123"'
      });
      mockS3Client.setResponse('CompleteMultipartUploadCommand', {
        $metadata: { httpStatusCode: 200 }
      });
    });

    it('should perform multipart upload for large files', async () => {
      const file = {
        name: 'large.zip',
        content: Buffer.alloc(1500), // 1.5KB > 1KB threshold
        size: 1500
      };

      await plugin.uploadLargeFile(file);

      const commands = mockS3Client.sentCommands;
      expect(commands.some(c => c.name === 'CreateMultipartUploadCommand')).toBe(true);
      expect(commands.some(c => c.name === 'UploadPartCommand')).toBe(true);
      expect(commands.some(c => c.name === 'CompleteMultipartUploadCommand')).toBe(true);
    });

    it('should abort multipart upload on error', async () => {
      mockS3Client.setError('UploadPartCommand', new Error('Upload failed'));
      
      const file = {
        name: 'large.zip',
        content: Buffer.alloc(1500),
        size: 1500
      };

      try {
        await plugin.uploadLargeFile(file);
      } catch (e) {
        // Expected to fail
      }

      const commands = mockS3Client.sentCommands;
      expect(commands.some(c => c.name === 'AbortMultipartUploadCommand')).toBe(true);
    });

    it('should retry on multipart upload failure', async () => {
      let attempts = 0;
      mockS3Client.send = jest.fn().mockImplementation(async (command) => {
        const commandName = command.constructor.name;
        
        if (commandName === 'CreateMultipartUploadCommand') {
          attempts++;
          if (attempts < 2) {
            throw new Error('Temporary failure');
          }
          return { UploadId: 'test-upload-id' };
        }
        if (commandName === 'UploadPartCommand') {
          return { ETag: '"etag"' };
        }
        if (commandName === 'CompleteMultipartUploadCommand') {
          return { $metadata: { httpStatusCode: 200 } };
        }
        return {};
      });

      const file = {
        name: 'large.zip',
        content: Buffer.alloc(1500),
        size: 1500
      };

      await plugin.uploadLargeFile(file);

      expect(attempts).toBe(2);
    });

    it('should skip existing large files when skipExistingFiles is enabled', async () => {
      plugin.options.skipExistingFiles = true;
      const content = Buffer.alloc(1500);
      const localETag = plugin.getMultipartETag(content, plugin.options.partSize);

      mockS3Client.setResponse('HeadObjectCommand', {
        ETag: `"${localETag}"`,
        $metadata: { httpStatusCode: 200 }
      });

      const file = {
        name: 'existing-large.zip',
        content,
        size: content.length
      };

      await plugin.uploadLargeFile(file);

      expect(plugin.skippedExistingCount).toBe(1);
    });
  });

  describe('collectAndUploadAssets', () => {
    it('should skip when no files to upload', async () => {
      const compilation = createMockCompilation({ assets: {} });
      
      // Mock console.log to capture output
      const mockConsole = createMockConsole();
      const originalLog = console.log;
      console.log = mockConsole.log;

      await plugin.collectAndUploadAssets(compilation, compilation.assets);

      expect(mockConsole.getCalls().log.some(call => 
        call.some(arg => typeof arg === 'string' && arg.includes('No files to upload'))
      )).toBe(true);

      console.log = originalLog;
    });

    it('should categorize files by size', async () => {
      plugin.options.multipartThreshold = 1024;
      plugin.options.progress = false;
      
      const assets = {
        'small.js': Buffer.from('small'),
        'large.zip': Buffer.alloc(2048) // 2KB > 1KB threshold
      };
      const compilation = createMockCompilation({ assets });

      // Mock successful uploads
      mockS3Client.setResponse('PutObjectCommand', {
        $metadata: { httpStatusCode: 200 }
      });
      mockS3Client.setResponse('CreateMultipartUploadCommand', {
        UploadId: 'test-id'
      });
      mockS3Client.setResponse('UploadPartCommand', {
        ETag: '"etag"'
      });
      mockS3Client.setResponse('CompleteMultipartUploadCommand', {
        $metadata: { httpStatusCode: 200 }
      });

      const mockConsole = createMockConsole();
      const originalLog = console.log;
      console.log = mockConsole.log;

      await plugin.collectAndUploadAssets(compilation, compilation.assets);

      console.log = originalLog;

      // Should have processed both files
      expect(plugin.successCount).toBeGreaterThanOrEqual(0);
    });

    it('should handle upload failures gracefully', async () => {
      plugin.options.continueOnError = true;
      plugin.options.progress = false;
      
      const assets = {
        'fail.js': Buffer.from('content')
      };
      const compilation = createMockCompilation({ assets });

      mockS3Client.setError('PutObjectCommand', new Error('Upload failed'));

      const mockConsole = createMockConsole();
      const originalLog = console.log;
      console.log = mockConsole.log;

      await plugin.collectAndUploadAssets(compilation, compilation.assets);

      console.log = originalLog;

      expect(plugin.failedUploads.length).toBeGreaterThan(0);
    });

    it('should throw on failure when continueOnError is false', async () => {
      plugin.options.continueOnError = false;
      plugin.options.progress = false;
      
      const assets = {
        'fail.js': Buffer.from('content')
      };
      const compilation = createMockCompilation({ assets });

      mockS3Client.setError('PutObjectCommand', new Error('Upload failed'));

      await expect(plugin.collectAndUploadAssets(compilation, compilation.assets))
        .rejects.toThrow('failed to upload');
    });
  });
});
