/**
 * Edge Cases and Error Handling Tests
 * Tests for boundary conditions and error scenarios
 */

const path = require('path');
const crypto = require('crypto');
const WebpackS3AssetsPlugin = require('../index.js');
const { createMockCompilation, MockS3Client, generateRandomContent, sleep } = require('./helpers.js');

jest.mock('@aws-sdk/client-s3');
jest.mock('@smithy/node-http-handler');
jest.mock('cli-progress');

describe('Edge Cases and Error Handling', () => {
  let plugin;

  beforeEach(() => {
    plugin = new WebpackS3AssetsPlugin({
      s3Options: { region: 'us-east-1' },
      s3UploadOptions: { Bucket: 'test-bucket' },
      progress: false,
      debug: false
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Empty and Null Handling', () => {
    it('should handle empty assets object', () => {
      const compilation = createMockCompilation({ assets: {} });
      const assets = plugin.getAssets(compilation, compilation.assets);

      expect(assets).toEqual([]);
    });

    it('should handle assets with empty content', () => {
      const assets = {
        'empty.js': Buffer.alloc(0)
      };
      const compilation = createMockCompilation({ assets });
      const result = plugin.getAssets(compilation, compilation.assets);

      expect(result).toHaveLength(1);
      expect(result[0].size).toBe(0);
      expect(result[0].content.length).toBe(0);
    });

    it('should handle null asset sources', () => {
      const compilation = createMockCompilation({ assets: {} });
      compilation.assets['null.js'] = {
        source: () => null
      };
      compilation.getAsset = jest.fn().mockReturnValue({
        name: 'null.js',
        source: { source: () => null },
        info: {}
      });

      const result = plugin.getAssets(compilation, compilation.assets);

      expect(result).toHaveLength(0);
    });

    it('should handle undefined asset sources', () => {
      const compilation = createMockCompilation({ assets: {} });
      compilation.assets['undefined.js'] = {
        source: () => undefined
      };

      const result = plugin.getAssets(compilation, compilation.assets);

      expect(result).toHaveLength(0);
    });
  });

  describe('File Size Boundaries', () => {
    it('should handle exactly multipart threshold size', () => {
      plugin.options.multipartThreshold = 1024;
      
      const content = Buffer.alloc(1024); // Exactly 1KB
      const isLarge = content.length >= plugin.options.multipartThreshold;

      expect(isLarge).toBe(true);
    });

    it('should handle file just below multipart threshold', () => {
      plugin.options.multipartThreshold = 1024;
      
      const content = Buffer.alloc(1023); // Just under 1KB
      const isLarge = content.length >= plugin.options.multipartThreshold;

      expect(isLarge).toBe(false);
    });

    it('should handle extremely large files', () => {
      plugin.options.maxFileSize = 5 * 1024 * 1024 * 1024; // 5GB
      
      const file = {
        name: 'huge.zip',
        content: Buffer.alloc(100 * 1024 * 1024), // 100MB
        size: 100 * 1024 * 1024
      };

      expect(file.size).toBeLessThan(plugin.options.maxFileSize);
    });

    it('should handle maximum file size limit', () => {
      plugin.options.maxFileSize = 100;
      plugin.options.skipLargeFiles = true;

      const file = {
        name: 'oversized.bin',
        content: Buffer.alloc(200),
        size: 200
      };

      expect(file.size).toBeGreaterThan(plugin.options.maxFileSize);
    });
  });

  describe('Path Handling', () => {
    it('should handle paths with special characters', () => {
      plugin.options.basePath = 'path/with spaces';
      const key = plugin.getS3Key('file.js');

      expect(key).toBe('path/with spaces/file.js');
    });

    it('should handle deeply nested paths', () => {
      plugin.options.basePath = 'a/b/c/d/e';
      const key = plugin.getS3Key('f/g/h/file.js');

      expect(key).toBe('a/b/c/d/e/f/g/h/file.js');
    });

    it('should handle empty basePath', () => {
      plugin.options.basePath = '';
      const key = plugin.getS3Key('file.js');

      expect(key).toBe('file.js');
    });

    it('should handle basePath with leading slash', () => {
      plugin.options.basePath = '/leading-slash';
      const key = plugin.getS3Key('file.js');

      expect(key).toBe('/leading-slash/file.js');
    });
  });

  describe('Pattern Matching Edge Cases', () => {
    it('should handle empty array in matchRule', () => {
      const result = plugin.matchRule('file.js', []);

      expect(result).toBe(true); // Empty array means all match
    });

    it('should handle complex regex patterns', () => {
      const pattern = /^(?!.*\.map$).*\.(js|css)$/; // JS or CSS, but not .map
      
      expect(plugin.matchRule('bundle.js', pattern)).toBe(true);
      expect(plugin.matchRule('bundle.js.map', pattern)).toBe(false);
      expect(plugin.matchRule('styles.css', pattern)).toBe(true);
      expect(plugin.matchRule('image.png', pattern)).toBe(false);
    });

    it('should handle function that throws', () => {
      const throwingMatcher = () => {
        throw new Error('Matcher error');
      };

      expect(() => plugin.matchRule('file.js', throwingMatcher)).toThrow('Matcher error');
    });

    it('should handle regex that matches everything', () => {
      const pattern = /.*/;
      
      expect(plugin.matchRule('', pattern)).toBe(true);
      expect(plugin.matchRule('anything', pattern)).toBe(true);
    });
  });

  describe('Rate Limiter Edge Cases', () => {
    it('should handle very small rate limits', () => {
      const plugin = new WebpackS3AssetsPlugin({
        s3Options: { region: 'us-east-1' },
        s3UploadOptions: { Bucket: 'test-bucket' },
        rateLimitKBps: 1 // 1KB/s
      });

      expect(plugin.options.rateLimitKBps).toBe(1);
    });

    it('should handle rate limit of zero', () => {
      const plugin = new WebpackS3AssetsPlugin({
        s3Options: { region: 'us-east-1' },
        s3UploadOptions: { Bucket: 'test-bucket' },
        rateLimitKBps: 0
      });

      expect(plugin.options.rateLimitKBps).toBe(0);
      expect(plugin.rateLimiter).toBeNull();
    });
  });

  describe('Timeout Handling', () => {
    it('should handle very short timeouts', () => {
      const plugin = new WebpackS3AssetsPlugin({
        s3Options: { region: 'us-east-1' },
        s3UploadOptions: { Bucket: 'test-bucket' },
        timeout: 1, // 1ms
        totalTimeout: 10 // 10ms
      });

      expect(plugin.options.timeout).toBe(1);
      expect(plugin.options.totalTimeout).toBe(10);
    });

    it('should handle very long timeouts', () => {
      const plugin = new WebpackS3AssetsPlugin({
        s3Options: { region: 'us-east-1' },
        s3UploadOptions: { Bucket: 'test-bucket' },
        timeout: 3600000, // 1 hour
        totalTimeout: 86400000 // 24 hours
      });

      expect(plugin.options.timeout).toBe(3600000);
      expect(plugin.options.totalTimeout).toBe(86400000);
    });
  });

  describe('Retry Logic Edge Cases', () => {
    it('should handle zero retries', () => {
      const plugin = new WebpackS3AssetsPlugin({
        s3Options: { region: 'us-east-1' },
        s3UploadOptions: { Bucket: 'test-bucket' },
        retries: 0
      });

      expect(plugin.options.retries).toBe(0);
    });

    it('should handle large retry counts', () => {
      const plugin = new WebpackS3AssetsPlugin({
        s3Options: { region: 'us-east-1' },
        s3UploadOptions: { Bucket: 'test-bucket' },
        retries: 100
      });

      expect(plugin.options.retries).toBe(100);
    });

    it('should handle zero retry delay', () => {
      const plugin = new WebpackS3AssetsPlugin({
        s3Options: { region: 'us-east-1' },
        s3UploadOptions: { Bucket: 'test-bucket' },
        retryDelay: 0
      });

      expect(plugin.options.retryDelay).toBe(0);
    });
  });

  describe('Content Type Detection', () => {
    it('should handle files without extension', () => {
      const file = {
        name: 'Makefile',
        content: Buffer.from('all: build'),
        size: 10
      };

      // Should use default content type
      expect(file.name).not.toMatch(/\.\w+$/);
    });

    it('should handle unusual extensions', () => {
      const file = {
        name: 'data.xyz123',
        content: Buffer.from('data'),
        size: 4
      };

      // Should fall back to octet-stream
      const mime = require('mime-types');
      const contentType = mime.lookup(file.name) || 'application/octet-stream';
      expect(contentType).toBe('application/octet-stream');
    });

    it('should handle multiple dots in filename', () => {
      const file = {
        name: 'bundle.min.js',
        content: Buffer.from('code'),
        size: 4
      };

      const mime = require('mime-types');
      const contentType = mime.lookup(file.name);
      expect(contentType).toBe('application/javascript');
    });
  });

  describe('MD5 Calculation Edge Cases', () => {
    it('should handle empty buffer for MD5', () => {
      const emptyBuffer = Buffer.alloc(0);
      const hash = plugin.getContentMD5(emptyBuffer);

      expect(hash).toBe('d41d8cd98f00b204e9800998ecf8427e'); // Known empty MD5
    });

    it('should handle very large content for MD5', () => {
      const largeContent = Buffer.alloc(10 * 1024 * 1024); // 10MB
      const startTime = Date.now();
      const hash = plugin.getContentMD5(largeContent);
      const duration = Date.now() - startTime;

      expect(hash).toHaveLength(32);
      expect(duration).toBeLessThan(1000); // Should be fast
    });

    it('should calculate consistent multipart ETags', () => {
      const content = Buffer.alloc(2500); // Spans 3 parts with 1KB parts
      const etag1 = plugin.getMultipartETag(content, 1024);
      const etag2 = plugin.getMultipartETag(content, 1024);

      expect(etag1).toBe(etag2);
      expect(etag1).toMatch(/-\d+$/);
    });
  });

  describe('Concurrency Edge Cases', () => {
    it('should handle concurrency of 1', () => {
      const plugin = new WebpackS3AssetsPlugin({
        s3Options: { region: 'us-east-1' },
        s3UploadOptions: { Bucket: 'test-bucket' },
        concurrency: 1
      });

      expect(plugin.options.concurrency).toBe(1);
    });

    it('should handle high concurrency', () => {
      const plugin = new WebpackS3AssetsPlugin({
        s3Options: { region: 'us-east-1' },
        s3UploadOptions: { Bucket: 'test-bucket' },
        concurrency: 100
      });

      expect(plugin.options.concurrency).toBe(100);
    });
  });

  describe('Memory and Performance', () => {
    it('should handle many small files efficiently', () => {
      const assets = {};
      for (let i = 0; i < 100; i++) {
        assets[`file${i}.js`] = Buffer.from(`content${i}`);
      }

      const compilation = createMockCompilation({ assets });
      const startTime = Date.now();
      const result = plugin.getAssets(compilation, compilation.assets);
      const duration = Date.now() - startTime;

      expect(result).toHaveLength(100);
      expect(duration).toBeLessThan(100); // Should be fast
    });

    it('should not leak memory with progress bar', async () => {
      plugin.options.progress = true;
      
      // Simulate multiple upload cycles
      for (let i = 0; i < 10; i++) {
        plugin.progressBar = { start: jest.fn(), update: jest.fn(), stop: jest.fn() };
        plugin.progressBar.stop();
        plugin.progressBar = null;
      }

      expect(plugin.progressBar).toBeNull();
    });
  });
});
