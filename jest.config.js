/**
 * Jest Configuration
 */

'use strict';

module.exports = {
  // Test environment
  testEnvironment: 'node',

  // Test file patterns
  testMatch: [
    '**/__tests__/**/*.test.js'
  ],

  // Coverage configuration
  collectCoverageFrom: [
    'index.js',
    '!node_modules/**',
    '!__tests__/**',
    '!coverage/**',
    '!examples/**'
  ],

  coverageDirectory: 'coverage',

  coverageReporters: [
    'text',
    'text-summary',
    'lcov',
    'html'
  ],

  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50
    }
  },

  // Verbose output
  verbose: true,

  // Test timeout (60 seconds)
  testTimeout: 60000,

  // Setup files
  setupFilesAfterEnv: [
    '<rootDir>/__tests__/setup.js'
  ],

  // Module file extensions
  moduleFileExtensions: [
    'js',
    'json',
    'node'
  ],

  // Transform configuration
  transform: {},

  // Module name mapper for mocking
  moduleNameMapper: {},

  // Clear mocks between tests
  clearMocks: true,

  // Reset mocks between tests
  resetMocks: false,

  // Restore mocks between tests
  restoreMocks: false,

  // Test path ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/coverage/',
    '/dist/'
  ],

  // watchPlugins: [
  //   'jest-watch-typeahead/filename',
  //   'jest-watch-typeahead/testname'
  // ],
  // watchPathIgnorePatterns: ['/node_modules/', '/temp/'],

  // Globals
  globals: {},

  // Error on deprecated API usage
  errorOnDeprecated: true,

  // Detect open handles
  detectOpenHandles: true,

  // Force exit after all tests complete
  forceExit: true
};
