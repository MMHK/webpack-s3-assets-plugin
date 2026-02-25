/**
 * WebpackS3AssetsPlugin Unit Tests
 * Tests for plugin methods and options
 */

const path = require('path');
const crypto = require('crypto');
const WebpackS3AssetsPlugin = require('../index.js');
const { createMockCompilation, createMockCompiler, generateRandomContent, createMockConsole } = require('./helpers.js');

describe('WebpackS3AssetsPlugin', () => {
  describe('constructor', () => {
    it('should create plugin with default options', () => {
      const plugin = new WebpackS3AssetsPlugin();

      expect(plugin.options.basePath).toBe('');
      expect(plugin.options.concurrency).toBe(3);
      expect(plugin.options.progress).toBe(true);
      expect(plugin.options.rateLimitKBps).toBe(0);
      expect(plugin.options.timeout).toBe(60000);
      expect(plugin.options.totalTimeout).toBe(600000);
      expect(plugin.options.retries).toBe(3);
      expect(plugin.options.retryDelay).toBe(2000);
      expect(plugin.options.continueOnError).toBe(true);
      expect(plugin.options.debug).toBe(false);
      expect(plugin.options.multipartThreshold).toBe(5 * 1024 * 1024);
      expect(plugin.options.partSize).toBe(5 * 1024 * 1024);
      expect(plugin.options.maxFileSize).toBe(5 * 1024 * 1024 * 1024);
      expect(plugin.options.skipLargeFiles).toBe(false);
      expect(plugin.options.skipExistingFiles).toBe(false);
    });

    it('should merge custom options with defaults', () => {
      const customOptions = {
        s3Options: { region: 'us-west-2' },
        s3UploadOptions: { Bucket: 'my-bucket' },
        basePath: 'assets/v1',
        concurrency: 10,
        progress: false,
        debug: true
      };

      const plugin = new WebpackS3AssetsPlugin(customOptions);

      expect(plugin.options.s3Options.region).toBe('us-west-2');
      expect(plugin.options.s3UploadOptions.Bucket).toBe('my-bucket');
      expect(plugin.options.basePath).toBe('assets/v1');
      expect(plugin.options.concurrency).toBe(10);
      expect(plugin.options.progress).toBe(false);
      expect(plugin.options.debug).toBe(true);
      // Should keep other defaults
      expect(plugin.options.retries).toBe(3);
    });

    it('should handle empty options object', () => {
      const plugin = new WebpackS3AssetsPlugin({});

      expect(plugin.options).toBeDefined();
      expect(plugin.options.basePath).toBe('');
    });
  });

  describe('getS3Key', () => {
    it('should return filename when basePath is empty', () => {
      const plugin = new WebpackS3AssetsPlugin();

      expect(plugin.getS3Key('bundle.js')).toBe('bundle.js');
      expect(plugin.getS3Key('path/to/file.css')).toBe('path/to/file.css');
    });

    it('should prepend basePath to filename', () => {
      const plugin = new WebpackS3AssetsPlugin({
        basePath: 'static/assets'
      });

      expect(plugin.getS3Key('bundle.js')).toBe('static/assets/bundle.js');
    });

    it('should handle basePath with trailing slash', () => {
      const plugin = new WebpackS3AssetsPlugin({
        basePath: 'static/assets/'
      });

      expect(plugin.getS3Key('bundle.js')).toBe('static/assets/bundle.js');
    });

    it('should handle nested paths correctly', () => {
      const plugin = new WebpackS3AssetsPlugin({
        basePath: 'v1'
      });

      expect(plugin.getS3Key('js/bundle.js')).toBe('v1/js/bundle.js');
      expect(plugin.getS3Key('css/style.css')).toBe('v1/css/style.css');
    });
  });

  describe('formatBytes', () => {
    let plugin;

    beforeEach(() => {
      plugin = new WebpackS3AssetsPlugin();
    });

    it('should format 0 bytes correctly', () => {
      expect(plugin.formatBytes(0)).toBe('0 B');
    });

    it('should format bytes correctly', () => {
      expect(plugin.formatBytes(512)).toBe('512 B');
    });

    it('should format kilobytes correctly', () => {
      expect(plugin.formatBytes(1024)).toBe('1 KB');
      expect(plugin.formatBytes(1536)).toBe('1.5 KB');
    });

    it('should format megabytes correctly', () => {
      expect(plugin.formatBytes(1024 * 1024)).toBe('1 MB');
      expect(plugin.formatBytes(5 * 1024 * 1024)).toBe('5 MB');
    });

    it('should format gigabytes correctly', () => {
      expect(plugin.formatBytes(1024 * 1024 * 1024)).toBe('1 GB');
    });
  });

  describe('matchRule', () => {
    let plugin;

    beforeEach(() => {
      plugin = new WebpackS3AssetsPlugin();
    });

    it('should match regex patterns', () => {
      expect(plugin.matchRule('bundle.js', /\.js$/)).toBe(true);
      expect(plugin.matchRule('bundle.css', /\.js$/)).toBe(false);
    });

    it('should call function matchers', () => {
      const matcher = jest.fn().mockReturnValue(true);
      expect(plugin.matchRule('file.js', matcher)).toBe(true);
      expect(matcher).toHaveBeenCalledWith('file.js');
    });

    it('should match all rules in array', () => {
      expect(plugin.matchRule('bundle.js', [/\.js$/, /bundle/])).toBe(true);
      expect(plugin.matchRule('bundle.css', [/\.js$/, /bundle/])).toBe(false);
    });

    it('should return false for invalid rule type', () => {
      expect(plugin.matchRule('file.js', 'invalid')).toBe(false);
      expect(plugin.matchRule('file.js', 123)).toBe(false);
    });
  });

  describe('getAssets', () => {
    let plugin;

    beforeEach(() => {
      plugin = new WebpackS3AssetsPlugin({
        s3UploadOptions: { Bucket: 'test-bucket' }
      });
    });

    it('should extract all assets from compilation', () => {
      const assets = {
        'bundle.js': Buffer.from('console.log("hello")'),
        'styles.css': Buffer.from('body { color: red; }'),
        'image.png': Buffer.from([0x89, 0x50, 0x4E, 0x47])
      };
      const compilation = createMockCompilation({ assets });

      const result = plugin.getAssets(compilation, compilation.assets);

      expect(result).toHaveLength(3);
      expect(result.map(a => a.name)).toContain('bundle.js');
      expect(result.map(a => a.name)).toContain('styles.css');
      expect(result.map(a => a.name)).toContain('image.png');
    });

    it('should handle webpack 5 getAsset method', () => {
      const assets = {
        'main.js': Buffer.from('module.exports = {}')
      };
      const compilation = createMockCompilation({ assets, webpackVersion: 5 });

      const result = plugin.getAssets(compilation, compilation.assets);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('main.js');
    });

    it('should filter assets with exclude option', () => {
      plugin.options.exclude = /\.map$/;
      const assets = {
        'bundle.js': Buffer.from('code'),
        'bundle.js.map': Buffer.from('map data')
      };
      const compilation = createMockCompilation({ assets });

      const result = plugin.getAssets(compilation, compilation.assets);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('bundle.js');
    });

    it('should filter assets with include option', () => {
      plugin.options.include = /\.(js|css)$/;
      const assets = {
        'bundle.js': Buffer.from('code'),
        'styles.css': Buffer.from('styles'),
        'image.png': Buffer.from('image data')
      };
      const compilation = createMockCompilation({ assets });

      const result = plugin.getAssets(compilation, compilation.assets);

      expect(result).toHaveLength(2);
      expect(result.map(a => a.name)).toContain('bundle.js');
      expect(result.map(a => a.name)).toContain('styles.css');
    });

    it('should handle string asset sources', () => {
      const assets = {
        'text.txt': 'plain text content'
      };
      const compilation = createMockCompilation({ assets });

      const result = plugin.getAssets(compilation, compilation.assets);

      expect(result).toHaveLength(1);
      expect(result[0].content.toString()).toBe('plain text content');
    });

    it('should skip assets with unsupported source types', () => {
      const assets = {
        'invalid.txt': null,
        'valid.js': Buffer.from('code')
      };
      const compilation = createMockCompilation({ assets });

      // Mock the invalid asset to return null source
      compilation.assets['invalid.txt'] = {
        source: () => null
      };

      const result = plugin.getAssets(compilation, compilation.assets);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('valid.js');
    });
  });

  describe('getContentMD5', () => {
    let plugin;

    beforeEach(() => {
      plugin = new WebpackS3AssetsPlugin();
    });

    it('should calculate correct MD5 hash', () => {
      const content = Buffer.from('Hello World');
      const expectedHash = crypto.createHash('md5').update(content).digest('hex');

      expect(plugin.getContentMD5(content)).toBe(expectedHash);
    });

    it('should return consistent hashes for same content', () => {
      const content = Buffer.from('test content');
      const hash1 = plugin.getContentMD5(content);
      const hash2 = plugin.getContentMD5(content);

      expect(hash1).toBe(hash2);
    });

    it('should return different hashes for different content', () => {
      const content1 = Buffer.from('content A');
      const content2 = Buffer.from('content B');

      const hash1 = plugin.getContentMD5(content1);
      const hash2 = plugin.getContentMD5(content2);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('getMultipartETag', () => {
    let plugin;

    beforeEach(() => {
      plugin = new WebpackS3AssetsPlugin({
        partSize: 1024 // 1KB parts for testing
      });
    });

    it('should calculate ETag for single part', () => {
      const content = Buffer.from('small content');
      const etag = plugin.getMultipartETag(content, 1024);

      expect(etag).toMatch(/^[a-f0-9]{32}-1$/);
    });

    it('should calculate ETag for multiple parts', () => {
      // Create content that spans 3 parts (1KB each)
      const content = Buffer.alloc(2500, 'a');
      const etag = plugin.getMultipartETag(content, 1024);

      expect(etag).toMatch(/^[a-f0-9]{32}-3$/);
    });

    it('should return consistent ETags for same content', () => {
      const content = generateRandomContent(5000);
      const etag1 = plugin.getMultipartETag(content, 1024);
      const etag2 = plugin.getMultipartETag(content, 1024);

      expect(etag1).toBe(etag2);
    });
  });

  describe('log method', () => {
    it('should log when debug is enabled', () => {
      const mockConsole = createMockConsole();
      const originalLog = console.log;
      console.log = mockConsole.log;

      const plugin = new WebpackS3AssetsPlugin({ debug: true });
      plugin.log('test message');

      expect(mockConsole.getCalls().log).toHaveLength(1);
      expect(mockConsole.getCalls().log[0][0]).toContain('[WebpackS3AssetsPlugin:DEBUG]');

      console.log = originalLog;
    });

    it('should not log when debug is disabled', () => {
      const mockConsole = createMockConsole();
      const originalLog = console.log;
      console.log = mockConsole.log;

      const plugin = new WebpackS3AssetsPlugin({ debug: false });
      plugin.log('test message');

      expect(mockConsole.getCalls().log).toHaveLength(0);

      console.log = originalLog;
    });
  });

  describe('sleep method', () => {
    let plugin;

    beforeEach(() => {
      plugin = new WebpackS3AssetsPlugin();
    });

    it('should wait for specified duration', async () => {
      const start = Date.now();
      await plugin.sleep(50);
      const duration = Date.now() - start;

      expect(duration).toBeGreaterThanOrEqual(45);
    });

    it('should return a promise', () => {
      const result = plugin.sleep(10);
      expect(result).toBeInstanceOf(Promise);
    });
  });

  describe('apply method', () => {
    it('should register hooks for webpack 5', () => {
      const plugin = new WebpackS3AssetsPlugin();
      const mockCompiler = createMockCompiler({ isWebpack5: true });

      plugin.apply(mockCompiler);

      expect(mockCompiler.hooks.compilation.tap).toHaveBeenCalled();
    });

    it('should register emit hook for webpack 4', () => {
      const plugin = new WebpackS3AssetsPlugin();
      const mockCompiler = createMockCompiler({ isWebpack5: false });
      mockCompiler.webpack = undefined;

      plugin.apply(mockCompiler);

      expect(mockCompiler.hooks.emit.tapAsync).toHaveBeenCalled();
    });
  });
});
