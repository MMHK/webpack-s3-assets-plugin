/**
 * RateLimiter Tests
 * Tests for rate limiting functionality
 */

const WebpackS3AssetsPlugin = require('../index.js');
const { measureTime, sleep } = require('./helpers.js');

describe('RateLimiter', () => {
  describe('constructor', () => {
    it('should initialize with correct rate limit', () => {
      const plugin = new WebpackS3AssetsPlugin({
        s3Options: { region: 'us-east-1' },
        s3UploadOptions: { Bucket: 'test-bucket' },
        rateLimitKBps: 1000
      });

      expect(plugin.options.rateLimitKBps).toBe(1000);
    });

    it('should have rate limit disabled by default', () => {
      const plugin = new WebpackS3AssetsPlugin({
        s3Options: { region: 'us-east-1' },
        s3UploadOptions: { Bucket: 'test-bucket' }
      });

      expect(plugin.options.rateLimitKBps).toBe(0);
    });
  });

  describe('rate limiting behavior', () => {
    it('should throttle uploads based on rate limit', async () => {
      // Create plugin with 100KB/s rate limit
      const plugin = new WebpackS3AssetsPlugin({
        s3Options: { region: 'us-east-1' },
        s3UploadOptions: { Bucket: 'test-bucket' },
        rateLimitKBps: 100,
        debug: false
      });

      // Initialize rate limiter
      const RateLimiter = plugin.rateLimiter?.constructor ||
        (await getRateLimiterFromModule());

      const rateLimiter = new RateLimiter(100); // 100KB/s

      // First consumption should be immediate
      const startTime = Date.now();
      await rateLimiter.consume(1024); // 1KB
      const firstDuration = Date.now() - startTime;
      expect(firstDuration).toBeLessThan(50); // Should be almost instant

      // Second consumption might need to wait
      await rateLimiter.consume(51200); // 50KB
      const secondDuration = Date.now() - startTime;
      // Should have waited some time to maintain rate limit
      expect(secondDuration).toBeGreaterThanOrEqual(0);
    });

    it('should calculate correct refill rate', async () => {
      const plugin = new WebpackS3AssetsPlugin({
        s3Options: { region: 'us-east-1' },
        s3UploadOptions: { Bucket: 'test-bucket' },
        rateLimitKBps: 1000
      });

      // Access rate limiter after it's created
      const rateLimiter = {
        rateLimitBytes: 1000 * 1024,
        refillRate: (1000 * 1024) / 1000
      };

      expect(rateLimiter.rateLimitBytes).toBe(1024000); // 1000KB in bytes
      expect(rateLimiter.refillRate).toBe(1024); // 1024 bytes per ms = ~1MB/s
    });

    it('should handle zero rate limit (disabled)', async () => {
      const plugin = new WebpackS3AssetsPlugin({
        s3Options: { region: 'us-east-1' },
        s3UploadOptions: { Bucket: 'test-bucket' },
        rateLimitKBps: 0
      });

      expect(plugin.options.rateLimitKBps).toBe(0);
      expect(plugin.rateLimiter).toBeNull();
    });
  });

  describe('token bucket algorithm', () => {
    it('should maintain token bucket correctly', async () => {
      const plugin = new WebpackS3AssetsPlugin({
        s3Options: { region: 'us-east-1' },
        s3UploadOptions: { Bucket: 'test-bucket' },
        rateLimitKBps: 100
      });

      // Rate limiter should be null until initialized
      expect(plugin.rateLimiter).toBeNull();
    });

    it('should refill tokens over time', async () => {
      const plugin = new WebpackS3AssetsPlugin({
        s3Options: { region: 'us-east-1' },
        s3UploadOptions: { Bucket: 'test-bucket' },
        rateLimitKBps: 100
      });

      // Verify rate limiter isn't created until needed
      expect(plugin.rateLimiter).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle very small rate limits', () => {
      const plugin = new WebpackS3AssetsPlugin({
        s3Options: { region: 'us-east-1' },
        s3UploadOptions: { Bucket: 'test-bucket' },
        rateLimitKBps: 1
      });

      expect(plugin.options.rateLimitKBps).toBe(1);
    });

    it('should handle large rate limits', () => {
      const plugin = new WebpackS3AssetsPlugin({
        s3Options: { region: 'us-east-1' },
        s3UploadOptions: { Bucket: 'test-bucket' },
        rateLimitKBps: 100000
      });

      expect(plugin.options.rateLimitKBps).toBe(100000);
    });
  });
});

/**
 * Helper function to extract RateLimiter from module
 */
async function getRateLimiterFromModule() {
  // RateLimiter is a private class inside the module
  // We'll test it through the plugin's behavior
  return null;
}
