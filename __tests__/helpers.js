/**
 * Test utilities and helpers for webpack-s3-assets-plugin
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

/**
 * Create a mock webpack compilation object
 * @param {Object} options - Configuration options
 * @returns {Object} Mock compilation object
 */
function createMockCompilation(options = {}) {
  const {
    assets = {},
    assetNames = [],
    webpackVersion = 5,
    errors = [],
    warnings = []
  } = options;

  const compilation = {
    assets: {},
    errors: [],
    warnings: [],
    getAsset: jest.fn(),
    emitAsset: jest.fn(),
    deleteAsset: jest.fn()
  };

  // Add assets to compilation
  Object.entries(assets).forEach(([name, content]) => {
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    const source = {
      source: jest.fn().mockReturnValue(buffer),
      size: jest.fn().mockReturnValue(buffer.length)
    };
    compilation.assets[name] = source;
    
    compilation.getAsset.mockImplementation((assetName) => {
      if (assetName === name) {
        return {
          name,
          source,
          info: {}
        };
      }
      return null;
    });
  });

  return compilation;
}

/**
 * Create a mock webpack compiler
 * @param {Object} options - Configuration options
 * @returns {Object} Mock compiler object
 */
function createMockCompiler(options = {}) {
  const {
    compilation = createMockCompilation(options),
    webpackVersion = 5,
    isWebpack5 = true
  } = options;

  const hooks = {
    compilation: {
      tap: jest.fn((name, callback) => {
        callback(compilation);
      })
    },
    emit: {
      tapAsync: jest.fn((name, callback) => {
        callback(compilation, () => {});
      })
    }
  };

  const mockCompiler = {
    hooks,
    webpack: isWebpack5 ? {
      Compilation: {
        PROCESS_ASSETS_STAGE_OPTIMIZE_TRANSFER: 3000
      }
    } : undefined,
    options: {
      output: {
        path: '/dist'
      }
    }
  };

  return mockCompiler;
}

/**
 * Mock S3 client responses
 */
class MockS3Client {
  constructor(options = {}) {
    this.options = options;
    this.sentCommands = [];
    this.responses = new Map();
    this.errors = new Map();
  }

  setResponse(commandName, response) {
    this.responses.set(commandName, response);
  }

  setError(commandName, error) {
    this.errors.set(commandName, error);
  }

  async send(command) {
    const commandName = command.constructor.name;
    this.sentCommands.push({
      name: commandName,
      input: command.input
    });

    if (this.errors.has(commandName)) {
      const error = this.errors.get(commandName);
      if (typeof error === 'function') {
        throw error();
      }
      throw error;
    }

    const response = this.responses.get(commandName);
    if (response) {
      if (typeof response === 'function') {
        return response(command);
      }
      return response;
    }

    return {};
  }

  destroy() {
    // Mock destroy method
  }
}

/**
 * Generate random file content
 * @param {number} sizeInBytes - Size of content in bytes
 * @returns {Buffer} Random content buffer
 */
function generateRandomContent(sizeInBytes) {
  return crypto.randomBytes(sizeInBytes);
}

/**
 * Create test assets with various sizes
 * @param {Object} options - Configuration options
 * @returns {Object} Test assets
 */
function createTestAssets(options = {}) {
  const {
    smallCount = 2,
    largeCount = 1,
    smallSize = 1024,  // 1KB
    largeSize = 10 * 1024 * 1024  // 10MB
  } = options;

  const assets = {};

  // Create small files
  for (let i = 0; i < smallCount; i++) {
    assets[`small-file-${i}.js`] = generateRandomContent(smallSize);
  }

  // Create large files
  for (let i = 0; i < largeCount; i++) {
    assets[`large-file-${i}.zip`] = generateRandomContent(largeSize);
  }

  return assets;
}

/**
 * Wait for a specified time
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Measure execution time of a function
 * @param {Function} fn - Function to measure
 * @returns {Promise<{result: *, duration: number}>}
 */
async function measureTime(fn) {
  const start = process.hrtime.bigint();
  const result = await fn();
  const end = process.hrtime.bigint();
  const duration = Number(end - start) / 1000000; // Convert to milliseconds
  return { result, duration };
}

/**
 * Create temporary directory for test files
 * @returns {string} Temporary directory path
 */
function createTempDir() {
  const tempDir = path.join(__dirname, 'temp', Date.now().toString());
  fs.mkdirSync(tempDir, { recursive: true });
  return tempDir;
}

/**
 * Clean up temporary directory
 * @param {string} tempDir - Directory to clean up
 */
function cleanupTempDir(tempDir) {
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

/**
 * Validate S3 upload parameters
 * @param {Object} params - Upload parameters
 * @returns {boolean} Is valid
 */
function validateS3UploadParams(params) {
  const required = ['Bucket', 'Key', 'Body'];
  return required.every(field => params[field] !== undefined);
}

/**
 * Compare two buffers for equality
 * @param {Buffer} buf1 - First buffer
 * @param {Buffer} buf2 - Second buffer
 * @returns {boolean} Are equal
 */
function buffersEqual(buf1, buf2) {
  if (buf1.length !== buf2.length) return false;
  return buf1.equals(buf2);
}

/**
 * Mock console methods
 * @returns {Object} Mock console with captured calls
 */
function createMockConsole() {
  const calls = {
    log: [],
    error: [],
    warn: [],
    info: []
  };

  return {
    log: jest.fn((...args) => calls.log.push(args)),
    error: jest.fn((...args) => calls.error.push(args)),
    warn: jest.fn((...args) => calls.warn.push(args)),
    info: jest.fn((...args) => calls.info.push(args)),
    getCalls: () => calls,
    clear: () => {
      calls.log = [];
      calls.error = [];
      calls.warn = [];
      calls.info = [];
    }
  };
}

module.exports = {
  createMockCompilation,
  createMockCompiler,
  MockS3Client,
  generateRandomContent,
  createTestAssets,
  sleep,
  measureTime,
  createTempDir,
  cleanupTempDir,
  validateS3UploadParams,
  buffersEqual,
  createMockConsole
};
