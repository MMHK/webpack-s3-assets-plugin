# Testing Guide

This document describes how to run and write tests for the webpack-s3-assets-plugin.

## Test Structure

```
__tests__/
├── setup.js              # Global test setup and configuration
├── helpers.js            # Test utilities and mock helpers
├── rate-limiter.test.js  # RateLimiter class tests
├── plugin-unit.test.js   # WebpackS3AssetsPlugin unit tests
├── s3-upload.test.js     # S3 upload functionality tests
├── integration.test.js   # Webpack integration tests
└── edge-cases.test.js    # Edge cases and error handling tests
```

## Running Tests

### Run all tests
```bash
yarn test
```

### Run tests in watch mode
```bash
yarn test:watch
```

### Run tests with coverage
```bash
yarn test:coverage
```

### Run tests silently (no console output)
```bash
yarn test:silent
```

### Run specific test file
```bash
yarn test -- rate-limiter
```

### Run tests matching a pattern
```bash
yarn test -- --testNamePattern="RateLimiter"
```

## Linting

### Run ESLint
```bash
yarn lint
```

### Fix ESLint issues
```bash
yarn lint:fix
```

### Generate ESLint report
```bash
yarn lint:report
```

## Continuous Integration

All tests are run automatically on:
- Pull requests to `main`, `master`, or `develop` branches
- Pushes to `main`, `master`, or `develop` branches

Tests run on:
- Node.js 16, 18, and 20
- Ubuntu, Windows, and macOS

## Writing Tests

### Test File Naming
- All test files must end with `.test.js`
- Place test files in `__tests__/` directory

### Test Structure
```javascript
const WebpackS3AssetsPlugin = require('../index.js');
const { createMockCompilation } = require('./helpers.js');

describe('Feature Name', () => {
  let plugin;

  beforeEach(() => {
    plugin = new WebpackS3AssetsPlugin({
      s3Options: { region: 'us-east-1' },
      s3UploadOptions: { Bucket: 'test-bucket' }
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should do something', () => {
    // Test code here
  });
});
```

### Available Helpers

#### createMockCompilation(options)
Creates a mock webpack compilation object.

```javascript
const compilation = createMockCompilation({
  assets: {
    'bundle.js': Buffer.from('console.log("hello")')
  },
  webpackVersion: 5
});
```

#### createMockCompiler(options)
Creates a mock webpack compiler object.

```javascript
const compiler = createMockCompiler({
  compilation: mockCompilation,
  isWebpack5: true
});
```

#### MockS3Client
Mock S3 client for testing upload functionality.

```javascript
const mockClient = new MockS3Client();
mockClient.setResponse('PutObjectCommand', { ETag: '"abc123"' });
mockClient.setError('HeadObjectCommand', new Error('NotFound'));
```

#### generateRandomContent(size)
Generates random buffer content.

```javascript
const content = generateRandomContent(1024); // 1KB of random data
```

### Best Practices

1. **Use descriptive test names**: Describe what the test is checking
2. **Keep tests independent**: Each test should be able to run independently
3. **Clean up after tests**: Use `afterEach` to clean up mocks and state
4. **Test edge cases**: Include tests for boundary conditions
5. **Mock external dependencies**: Use mocks for S3 client, etc.
6. **Use async/await**: For async operations, use async/await pattern

### Environment Variables

- `SILENT_TESTS=true`: Suppress console output during tests
- `DEBUG_TESTS=true`: Show detailed debug information
- `TEST_TIMEOUT=ms`: Set custom test timeout
- `CI=true`: Run in CI mode (optimized output)

## Coverage Requirements

- Branches: 50%
- Functions: 50%
- Lines: 50%
- Statements: 50%

Coverage reports are generated in the `coverage/` directory.

## Troubleshooting

### Tests timeout
Increase the timeout using environment variable:
```bash
TEST_TIMEOUT=120000 yarn test
```

### Tests fail with "open handles" error
The Jest configuration includes `detectOpenHandles: true`. If you see this error:
1. Check for unclosed resources in your tests
2. Use `afterEach` to clean up resources
3. Check for timers that aren't being cleared

### Mock issues
If mocks aren't working as expected:
1. Call `jest.clearAllMocks()` in `afterEach`
2. Check that mocks are defined at the right scope
3. Verify mock paths are correct

## Contributing

When adding new features:
1. Write tests for the new functionality
2. Ensure all existing tests pass
3. Maintain or improve code coverage
4. Follow the existing test patterns
5. Update this guide if needed
