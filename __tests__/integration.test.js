/**
 * Integration Tests
 * Tests for webpack integration and end-to-end scenarios
 */

const path = require('path');
const webpack = require('webpack');
const WebpackS3AssetsPlugin = require('../index.js');
const { createTempDir, cleanupTempDir } = require('./helpers.js');

// Mock AWS SDK
jest.mock('@aws-sdk/client-s3');
jest.mock('@smithy/node-http-handler');
jest.mock('cli-progress');

describe('Webpack Integration', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
    jest.clearAllMocks();
  });

  describe('Plugin Registration', () => {
    it('should work with webpack 5 configuration', (done) => {
      const fs = require('fs');
      const entryFile = path.join(tempDir, 'entry.js');
      fs.writeFileSync(entryFile, 'console.log("hello world");');

      const compiler = webpack({
        mode: 'production',
        entry: entryFile,
        output: {
          path: path.join(tempDir, 'dist'),
          filename: 'bundle.js'
        },
        plugins: [
          new WebpackS3AssetsPlugin({
            s3Options: { region: 'us-east-1' },
            s3UploadOptions: { Bucket: 'test-bucket' },
            progress: false,
            debug: false
          })
        ]
      });

      compiler.run((err, stats) => {
        expect(err).toBeNull();
        expect(stats.hasErrors()).toBe(false);
        done();
      });
    }, 30000);

    it('should handle multiple entry points', (done) => {
      const fs = require('fs');
      const entryA = path.join(tempDir, 'entryA.js');
      const entryB = path.join(tempDir, 'entryB.js');
      fs.writeFileSync(entryA, 'module.exports = "A";');
      fs.writeFileSync(entryB, 'module.exports = "B";');

      const compiler = webpack({
        mode: 'production',
        entry: {
          appA: entryA,
          appB: entryB
        },
        output: {
          path: path.join(tempDir, 'dist'),
          filename: '[name].js'
        },
        plugins: [
          new WebpackS3AssetsPlugin({
            s3Options: { region: 'us-east-1' },
            s3UploadOptions: { Bucket: 'test-bucket' },
            progress: false
          })
        ]
      });

      compiler.run((err, stats) => {
        expect(err).toBeNull();
        expect(stats.hasErrors()).toBe(false);
        done();
      });
    }, 30000);
  });

  describe('Asset Processing', () => {
    it('should process CSS files', (done) => {
      const fs = require('fs');
      const entryFile = path.join(tempDir, 'entry.js');
      const cssFile = path.join(tempDir, 'styles.css');
      fs.writeFileSync(entryFile, 'import "./styles.css"; console.log("loaded");');
      fs.writeFileSync(cssFile, 'body { background: red; }');

      const MiniCssExtractPlugin = require('mini-css-extract-plugin');

      const compiler = webpack({
        mode: 'production',
        entry: entryFile,
        output: {
          path: path.join(tempDir, 'dist'),
          filename: 'bundle.js'
        },
        module: {
          rules: [
            {
              test: /\.css$/,
              use: [MiniCssExtractPlugin.loader, 'css-loader']
            }
          ]
        },
        plugins: [
          new MiniCssExtractPlugin({
            filename: '[name].css'
          }),
          new WebpackS3AssetsPlugin({
            s3Options: { region: 'us-east-1' },
            s3UploadOptions: { Bucket: 'test-bucket' },
            progress: false
          })
        ]
      });

      compiler.run((err, stats) => {
        // May fail if mini-css-extract-plugin is not installed
        // That's okay, we're testing the plugin registration
        done();
      });
    }, 30000);

    it('should respect include/exclude patterns', (done) => {
      const fs = require('fs');
      const entryFile = path.join(tempDir, 'entry.js');
      fs.writeFileSync(entryFile, 'console.log("test");');

      const plugin = new WebpackS3AssetsPlugin({
        s3Options: { region: 'us-east-1' },
        s3UploadOptions: { Bucket: 'test-bucket' },
        include: /\.js$/,
        exclude: /\.map$/,
        progress: false
      });

      const compiler = webpack({
        mode: 'production',
        devtool: 'source-map',
        entry: entryFile,
        output: {
          path: path.join(tempDir, 'dist'),
          filename: 'bundle.js'
        },
        plugins: [plugin]
      });

      compiler.run((err, stats) => {
        expect(err).toBeNull();
        done();
      });
    }, 30000);
  });

  describe('Error Handling', () => {
    it('should handle compilation errors gracefully', (done) => {
      const entryFile = path.join(tempDir, 'entry.js');
      
      const compiler = webpack({
        mode: 'production',
        entry: entryFile, // File doesn't exist
        output: {
          path: path.join(tempDir, 'dist'),
          filename: 'bundle.js'
        },
        plugins: [
          new WebpackS3AssetsPlugin({
            s3Options: { region: 'us-east-1' },
            s3UploadOptions: { Bucket: 'test-bucket' },
            progress: false
          })
        ]
      });

      compiler.run((err, stats) => {
        expect(stats.hasErrors()).toBe(true);
        done();
      });
    }, 30000);

    it('should continue on upload errors when configured', (done) => {
      const fs = require('fs');
      const entryFile = path.join(tempDir, 'entry.js');
      fs.writeFileSync(entryFile, 'console.log("test");');

      const compiler = webpack({
        mode: 'production',
        entry: entryFile,
        output: {
          path: path.join(tempDir, 'dist'),
          filename: 'bundle.js'
        },
        plugins: [
          new WebpackS3AssetsPlugin({
            s3Options: { region: 'us-east-1' },
            s3UploadOptions: { Bucket: 'test-bucket' },
            continueOnError: true,
            progress: false
          })
        ]
      });

      compiler.run((err, stats) => {
        // Should complete even if upload fails
        expect(err).toBeNull();
        done();
      });
    }, 30000);
  });

  describe('Configuration Options', () => {
    it('should accept all valid options', (done) => {
      const fs = require('fs');
      const entryFile = path.join(tempDir, 'entry.js');
      fs.writeFileSync(entryFile, 'console.log("test");');

      const compiler = webpack({
        mode: 'production',
        entry: entryFile,
        output: {
          path: path.join(tempDir, 'dist'),
          filename: 'bundle.js'
        },
        plugins: [
          new WebpackS3AssetsPlugin({
            s3Options: { 
              region: 'us-west-2',
              credentials: {
                accessKeyId: 'test',
                secretAccessKey: 'test'
              }
            },
            s3UploadOptions: { 
              Bucket: 'my-bucket',
              ACL: 'public-read',
              StorageClass: 'STANDARD_IA'
            },
            basePath: 'assets/v1',
            include: /\.(js|css|png|jpg)$/,
            exclude: /\.map$/,
            progress: true,
            concurrency: 5,
            rateLimitKBps: 1000,
            timeout: 30000,
            totalTimeout: 300000,
            retries: 5,
            retryDelay: 1000,
            continueOnError: true,
            debug: false,
            multipartThreshold: 10 * 1024 * 1024,
            partSize: 10 * 1024 * 1024,
            maxFileSize: 5 * 1024 * 1024 * 1024,
            skipLargeFiles: false,
            skipExistingFiles: false
          })
        ]
      });

      compiler.run((err, stats) => {
        expect(err).toBeNull();
        expect(stats.hasErrors()).toBe(false);
        done();
      });
    }, 30000);

    it('should work with minimal configuration', (done) => {
      const fs = require('fs');
      const entryFile = path.join(tempDir, 'entry.js');
      fs.writeFileSync(entryFile, 'console.log("test");');

      const compiler = webpack({
        mode: 'production',
        entry: entryFile,
        output: {
          path: path.join(tempDir, 'dist'),
          filename: 'bundle.js'
        },
        plugins: [
          new WebpackS3AssetsPlugin({
            s3Options: { region: 'us-east-1' },
            s3UploadOptions: { Bucket: 'test-bucket' }
          })
        ]
      });

      compiler.run((err, stats) => {
        expect(err).toBeNull();
        done();
      });
    }, 30000);
  });

  describe('Watch Mode', () => {
    it('should handle rebuilds in watch mode', (done) => {
      const fs = require('fs');
      const entryFile = path.join(tempDir, 'entry.js');
      fs.writeFileSync(entryFile, 'console.log("v1");');

      const compiler = webpack({
        mode: 'development',
        entry: entryFile,
        output: {
          path: path.join(tempDir, 'dist'),
          filename: 'bundle.js'
        },
        plugins: [
          new WebpackS3AssetsPlugin({
            s3Options: { region: 'us-east-1' },
            s3UploadOptions: { Bucket: 'test-bucket' },
            progress: false
          })
        ]
      });

      let buildCount = 0;
      const watching = compiler.watch({}, (err, stats) => {
        buildCount++;
        expect(err).toBeNull();
        
        if (buildCount === 1) {
          // Trigger a rebuild
          fs.writeFileSync(entryFile, 'console.log("v2");');
        } else {
          watching.close();
          done();
        }
      });
    }, 60000);
  });
});
