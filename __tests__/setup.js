/**
 * Test Setup File
 * Global configuration and utilities for tests
 */

'use strict';

// Store original console methods
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleInfo = console.info;

// Global test configuration
beforeAll(function() {
  // Optionally suppress console output during tests
  if (process.env.SILENT_TESTS === 'true') {
    console.log = function() {};
    console.error = function() {};
    console.warn = function() {};
    console.info = function() {};
  }

  // Set default timeout for async operations
  if (process.env.TEST_TIMEOUT) {
    jest.setTimeout(parseInt(process.env.TEST_TIMEOUT, 10));
  }
});

// Restore console methods after all tests
afterAll(function() {
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
  console.info = originalConsoleInfo;
});

// Global error handling for unhandled promises
process.on('unhandledRejection', function(reason, promise) {
  if (process.env.DEBUG_TESTS === 'true') {
    originalConsoleError('Unhandled Rejection at:', promise, 'reason:', reason);
  }
});

// Clean up any temporary files after tests
afterAll(function() {
  const fs = require('fs');
  const path = require('path');
  const tempDir = path.join(__dirname, 'temp');
  
  if (fs.existsSync(tempDir)) {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  }
});

// Increase default timeout
jest.setTimeout(60000);
