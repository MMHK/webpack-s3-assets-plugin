# Testing Guide

This document describes how to run and write tests for the webpack-s3-assets-plugin.

## Test Structure

```
__tests__/
├── setup.js                    # Global test setup and configuration
├── helpers.js                  # Test utilities and mock helpers
├── rate-limiter.test.js        # RateLimiter class tests
├── plugin-unit.test.js         # WebpackS3AssetsPlugin unit tests
├── s3-upload.test.js           # S3 upload functionality tests
├── integration.test.js         # Webpack integration tests
├── edge-cases.test.js          # Edge cases and error handling tests
├── plugin-compatibility.test.js # Webpack plugin compatibility tests
└── e2e-real-s3.test.js         # E2E tests with real S3 bucket
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
  webpackVersion: 5,
  errors: [],
  warnings: []
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

// Access sent commands
console.log(mockClient.sentCommands);
```

#### generateRandomContent(size)
Generates random buffer content.

```javascript
const content = generateRandomContent(1024); // 1KB of random data
```

#### createTestAssets(options)
Creates test assets with various sizes.

```javascript
const assets = createTestAssets({
  smallCount: 2,    // Number of small files
  largeCount: 1,    // Number of large files
  smallSize: 1024,  // 1KB
  largeSize: 10 * 1024 * 1024  // 10MB
});
```

#### createMockConsole()
Creates a mock console for capturing log output.

```javascript
const mockConsole = createMockConsole();
// Use mockConsole.log, mockConsole.error, etc.

// Get captured calls
const calls = mockConsole.getCalls();
mockConsole.clear(); // Clear all captured calls
```

#### createTempDir() / cleanupTempDir(tempDir)
Create and cleanup temporary directories for tests.

```javascript
const tempDir = createTempDir();
// ... use tempDir ...
cleanupTempDir(tempDir);
```

#### measureTime(fn)
Measures execution time of a function.

```javascript
const { result, duration } = await measureTime(async () => {
  return await someAsyncOperation();
});
console.log(`Operation took ${duration}ms`);
```

#### sleep(ms)
Wait for a specified time.

```javascript
await sleep(1000); // Wait 1 second
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

## E2E Tests with Real S3

The `e2e-real-s3.test.js` test performs actual uploads to an S3 bucket. These tests are automatically skipped if S3 credentials are not configured.

### Configuration

Create `__tests__/.env` file with your S3 credentials:

```bash
AWS_ACCESS_KEY=your_access_key_id
AWS_SECRET_ACCESS_KEY=your_secret_access_key
AWS_BUCKET=your_bucket_name
AWS_REGION=your_region  # e.g., us-east-1
```

### Running E2E Tests

```bash
# Run only E2E tests
yarn test -- e2e-real-s3

# Or with npm
npm test -- __tests__/e2e-real-s3.test.js
```

### What E2E Tests Cover

1. **Basic upload** - Uploads webpack assets to real S3 bucket and verifies files
2. **Include/Exclude filters** - Tests file filtering with regex patterns
3. **Skip existing files** - Tests `skipExistingFiles` option behavior

### Cleanup

E2E tests automatically clean up uploaded files after completion. Each test run creates a unique folder in S3 to avoid conflicts.

## Plugin Compatibility Tests

The `plugin-compatibility.test.js` tests compatibility with popular webpack plugins:

| Plugin | Test Coverage |
|--------|--------------|
| CleanWebpackPlugin | ✅ Works correctly |
| TerserPlugin | ✅ Works with minification |
| HtmlWebpackPlugin | ✅ Generates HTML correctly |
| webpack.ProgressPlugin | ✅ Progress tracking works |
| CopyWebpackPlugin | ✅ Static file copying works |
| webpack.DefinePlugin | ✅ Environment variables work |
| MiniCssExtractPlugin | ✅ CSS extraction works |
| WebpackManifestPlugin | ✅ Manifest generation works |
| Multiple plugins combined | ✅ All work together |

```bash
# Run only compatibility tests
yarn test -- plugin-compatibility
```

## Test Categories

### Unit Tests (`plugin-unit.test.js`)
Tests individual plugin methods and internal logic without webpack integration.

### S3 Upload Tests (`s3-upload.test.js`)
Tests S3 upload functionality including:
- Single and multipart uploads
- Retry logic
- Rate limiting
- Error handling

### Integration Tests (`integration.test.js`)
Tests full webpack integration with mocked S3 client.

### Edge Cases (`edge-cases.test.js`)
Tests boundary conditions and error scenarios:
- Empty asset lists
- Network failures
- Invalid configurations
- Timeout handling
- Rate limiting edge cases

### Rate Limiter Tests (`rate-limiter.test.js`)
Tests the internal `RateLimiter` class for:
- Token bucket algorithm
- Concurrency control
- Dynamic rate adjustment

## Continuous Integration

All tests are run automatically on:
- Pull requests to `main`, `master`, or `develop` branches
- Pushes to `main`, `master`, or `develop` branches

Tests run on:
- Node.js 16, 18, and 20
- Ubuntu, Windows, and macOS

**Note:** E2E tests with real S3 are skipped in CI unless credentials are provided.

## Contributing

When adding new features:
1. Write tests for the new functionality
2. Ensure all existing tests pass
3. Maintain or improve code coverage
4. Follow the existing test patterns
5. Update this guide if needed

### Test Naming Conventions

- Use descriptive test names that explain the behavior being tested
- Group related tests using `describe` blocks
- Use `it('should ...')` pattern for test cases

Example:
```javascript
describe('S3 Upload', () => {
  describe('when file is larger than threshold', () => {
    it('should use multipart upload', async () => {
      // test implementation
    });
  });
});
```
