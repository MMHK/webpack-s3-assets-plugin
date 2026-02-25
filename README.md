# webpack-s3-assets-plugin

Modern webpack plugin for uploading assets to AWS S3 with enhanced features including concurrency control, rate limiting, retry logic, timeout handling, and progress bar. Uses **manual multipart upload** to work around AWS SDK v3 lib-storage bugs.

[![npm version](https://badge.fury.io/js/webpack-s3-assets-plugin.svg)](https://www.npmjs.com/package/webpack-s3-assets-plugin)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Table of Contents

- [Features](#features)
- [Why This Plugin?](#why-this-plugin)
- [Installation](#installation)
- [Usage](#usage)
  - [Basic Configuration](#basic-configuration)
  - [Advanced Configuration](#advanced-configuration)
- [Options](#options)
- [How It Works](#how-it-works)
- [Examples](#examples)
- [Plugin Compatibility](#plugin-compatibility)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [Changelog](#changelog)
- [License](#license)

## Features

- **Webpack 4/5 Compatible** - Works with both webpack versions
- **Modern AWS SDK v3** - Uses latest AWS SDK for better performance
- **Two Upload Strategies**:
  - **Small files (<5MB)**: Direct PutObjectCommand (fast & reliable)
  - **Large files (≥5MB)**: Manual multipart upload with progress tracking
- **Concurrent Uploads** - Configurable concurrency with connection pooling
- **Rate Limiting** - Control upload bandwidth in KB/s
- **Retry & Timeout** - Automatic retry with exponential backoff
- **Progress Tracking** - Real-time progress for multipart uploads
- **Progress Bar** - Visual feedback during upload
- **TypeScript Support** - Built-in TypeScript definitions
- **Error Resilience** - Continue on errors or fail fast

## Why This Plugin?

AWS SDK v3's `@aws-sdk/lib-storage` has known issues with large file uploads:
- **Issue #7729**: `Upload.done()` never resolves after large streaming upload
- **Issue #5561**: Multipart upload requests suddenly get stuck without error
- **Issue #7179**: Memory leak with large files (>200MB)

This plugin **bypasses lib-storage** by using manual multipart upload for large files and PutObjectCommand for small files, avoiding these bugs entirely.

## Installation

```bash
npm install webpack-s3-assets-plugin --save-dev
# or
yarn add -D webpack-s3-assets-plugin
```

## Usage

### Basic Configuration

```javascript
const WebpackS3AssetsPlugin = require('webpack-s3-assets-plugin');

module.exports = {
  plugins: [
    new WebpackS3AssetsPlugin({
      s3Options: {
        region: 'us-west-2',
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
        }
      },
      s3UploadOptions: {
        Bucket: 'my-bucket'
      }
    })
  ]
};
```

### Advanced Configuration

```javascript
const WebpackS3AssetsPlugin = require('webpack-s3-assets-plugin');

module.exports = {
  plugins: [
    new WebpackS3AssetsPlugin({
      // AWS S3 Client options
      s3Options: {
        region: 'us-west-2',
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
        }
      },
      
      // S3 upload options
      s3UploadOptions: {
        Bucket: 'my-bucket',
        ACL: 'public-read',
        CacheControl: 'max-age=31536000'
      },
      
      // Base path in S3 bucket
      basePath: 'dist/v1.0.0',
      
      // Include/exclude filters (RegExp, function, or array)
      include: /\.(js|css|png|jpg|gif)$/,
      exclude: /\.map$/,
      
      // Concurrency control (default: 3)
      concurrency: 3,
      
      // Rate limit in KB/s (0 = no limit)
      rateLimitKBps: 1024,
      
      // Timeout settings (in milliseconds)
      timeout: 60000,        // Single file/part timeout (default: 60s)
      totalTimeout: 600000,  // Total timeout for all files (default: 10m)
      
      // Retry settings
      retries: 3,            // Retry attempts (default: 3)
      retryDelay: 2000,      // Initial retry delay (default: 2s)
      
      // Error handling
      continueOnError: true, // Continue if some files fail
      
      // Multipart upload settings
      multipartThreshold: 5 * 1024 * 1024,  // Switch to multipart at 5MB (default)
      partSize: 5 * 1024 * 1024,            // 5MB parts for multipart upload
      maxFileSize: 5 * 1024 * 1024 * 1024,  // 5GB max file size
      skipLargeFiles: false,                // Skip files exceeding maxFileSize
      skipExistingFiles: false,             // Skip files already in S3 with same content
      
      // Progress & debug
      progress: true,        // Show progress bar
      debug: false           // Enable debug logging
    })
  ]
};
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `s3Options` | `object` | `{}` | AWS S3 client configuration |
| `s3UploadOptions` | `object` | `{}` | S3 PutObject options including `Bucket` (required) |
| `basePath` | `string` | `''` | Base path prefix for uploaded files in S3 |
| `include` | `RegExp\|Function\|Array` | `null` | Filter to include specific files |
| `exclude` | `RegExp\|Function\|Array` | `null` | Filter to exclude specific files |
| `progress` | `boolean` | `true` | Enable progress bar |
| `concurrency` | `number` | `3` | Maximum concurrent uploads (recommended: 2-5) |
| `rateLimitKBps` | `number` | `0` | Rate limit in KB/s (0 = unlimited) |
| `timeout` | `number` | `60000` | Single file/part upload timeout in ms |
| `totalTimeout` | `number` | `600000` | Total upload timeout for all files in ms |
| `retries` | `number` | `3` | Number of retry attempts for failed uploads |
| `retryDelay` | `number` | `2000` | Initial delay between retries in ms |
| `continueOnError` | `boolean` | `true` | Continue uploading other files when one fails |
| `debug` | `boolean` | `false` | Enable debug logging to console |
| `multipartThreshold` | `number` | `5242880` | File size threshold (5MB) to switch to multipart upload |
| `partSize` | `number` | `5242880` | Part size (5MB) for multipart uploads |
| `maxFileSize` | `number` | `5368709120` | Maximum file size (5GB) |
| `skipLargeFiles` | `boolean` | `false` | Skip files larger than maxFileSize instead of failing |
| `skipExistingFiles` | `boolean` | `false` | Skip files that already exist in S3 with the same content (MD5 hash comparison) |

## How It Works

### Small Files (< multipartThreshold, default 5MB)

Uses `PutObjectCommand` - simple, fast, and reliable for small files.

```
📄 Small files (<5.00 MB): 45 (PutObjectCommand)
📄 PutObjectCommand: main.js completed
📄 PutObjectCommand: styles.css completed
```

### Large Files (≥ multipartThreshold, default 5MB)

Uses manual multipart upload - creates multipart upload, uploads parts sequentially, then completes.

```
🎬 Large files (≥5.00 MB): 3 (Multipart Upload)

🎬 Multipart Upload: video.mp4 (45.32 MB)
  Uploading part 1/10 (5.00 MB)
  📤 video.mp4: 10% (5.00 MB/45.32 MB)
  Uploading part 2/10 (5.00 MB)
  📤 video.mp4: 20% (10.00 MB/45.32 MB)
  ...
  Completing multipart upload: abc123...
  ✅ Multipart upload completed: video.mp4
```

## Troubleshooting

### Upload Stuck/Hanging

If uploads get stuck with many files:

1. **Reduce concurrency** (recommended: 2-3):
```javascript
new WebpackS3AssetsPlugin({
  concurrency: 2,
  timeout: 30000  // Shorter timeout per file
})
```

2. **Enable debug mode** to see detailed logs:
```javascript
new WebpackS3AssetsPlugin({
  debug: true
})
```

3. **Use rate limiting** to prevent overwhelming the connection:
```javascript
new WebpackS3AssetsPlugin({
  rateLimitKBps: 512,  // Limit to 512 KB/s
  concurrency: 2
})
```

### Large Files / Video Uploads Timeout

For large files like videos:

```javascript
new WebpackS3AssetsPlugin({
  // Increase timeout for each part
  timeout: 120000,           // 2 minutes per part
  totalTimeout: 1800000,     // 30 minutes total
  
  // Lower threshold to use multipart earlier
  multipartThreshold: 1 * 1024 * 1024,  // 1MB
  
  // Larger parts = fewer requests (better for slow connections)
  partSize: 10 * 1024 * 1024,  // 10MB parts
  
  // Increase max file size limit (default 5GB)
  maxFileSize: 10 * 1024 * 1024 * 1024,  // 10GB
  
  // Or skip files that are too large
  skipLargeFiles: true,
  
  // Reduce concurrency for large files
  concurrency: 1,
  
  debug: true  // See per-part progress
})
```

### Timeouts

If you see timeout errors:

- Increase `timeout` for each part upload
- Increase `totalTimeout` if uploading many files
- Check your network connection
- For very large files, consider using `skipLargeFiles: true` and uploading separately

### Failed Uploads

If some files consistently fail:

- Check S3 permissions and bucket policy
- Verify file sizes are within S3 limits
- Enable `continueOnError: true` to upload other files
- Check debug logs for specific error messages
- For large files, ensure your network can handle the upload speed

## S3 Upload Options

The `s3UploadOptions` accepts all options from [AWS SDK PutObjectCommand](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-s3/interfaces/putobjectcommandinput.html):

```javascript
new WebpackS3AssetsPlugin({
  s3UploadOptions: {
    Bucket: 'my-bucket',           // Required, no default
    ACL: 'public-read',            // Default: undefined (uses bucket default)
    CacheControl: 'max-age=31536000',  // Default: undefined
    ContentDisposition: 'attachment',  // Default: undefined
    ContentEncoding: 'gzip',       // Default: undefined
    ContentType: 'application/javascript',  // Default: auto-detected from file extension
    Expires: new Date('2025-12-31'),  // Default: undefined
    Metadata: {                    // Default: undefined
      'x-amz-meta-version': '1.0.0',
      'x-amz-meta-build': process.env.BUILD_ID
    },
    ServerSideEncryption: 'AES256',  // Default: undefined
    StorageClass: 'STANDARD_IA'    // Default: 'STANDARD'
  }
})
```

### Default Values

| Option | Default | Description |
|--------|---------|-------------|
| `Bucket` | *(required)* | S3 bucket name - **must be provided** |
| `ACL` | `undefined` | Uses bucket's default ACL |
| `ContentType` | *(auto-detected)* | Detected from file extension using `mime-types` library, falls back to `application/octet-stream` |
| `CacheControl` | `undefined` | No caching headers set |
| `ContentDisposition` | `undefined` | No disposition set |
| `ContentEncoding` | `undefined` | No encoding set |
| `StorageClass` | `'STANDARD'` | Standard S3 storage |
| `ServerSideEncryption` | `undefined` | No server-side encryption |
| `Metadata` | `undefined` | No custom metadata |
| `Expires` | `undefined` | No expiration date |

### Auto-Detected Content Types

Content types are automatically detected from file extensions:

```javascript
// Examples of auto-detection:
'style.css'     → 'text/css'
'app.js'        → 'application/javascript'
'image.png'     → 'image/png'
'font.woff2'    → 'font/woff2'
'video.mp4'     → 'video/mp4'
'data.bin'      → 'application/octet-stream' (fallback)
```

You can override auto-detection by explicitly setting `ContentType` in `s3UploadOptions`.

### Common ACL Values

- `private` - Owner-only access
- `public-read` - Anyone can read
- `public-read-write` - Anyone can read/write (not recommended)
- `authenticated-read` - Authenticated AWS users can read

### Storage Classes

- `STANDARD` - Default, for frequently accessed data
- `STANDARD_IA` - Infrequent Access, lower cost
- `ONEZONE_IA` - Single zone, lower cost
- `GLACIER` - Archive storage
- `INTELLIGENT_TIERING` - Automatic cost optimization

## Filter Examples

### Using Regular Expressions

```javascript
new WebpackS3AssetsPlugin({
  include: /\.(js|css)$/,
  exclude: /\.test\.js$/
});
```

### Using Functions

```javascript
new WebpackS3AssetsPlugin({
  include: (filename) => filename.startsWith('main'),
  exclude: (filename) => filename.includes('test')
});
```

### Using Arrays

```javascript
new WebpackS3AssetsPlugin({
  include: [
    /\.js$/,
    (filename) => filename.length > 10
  ]
});
```

## TypeScript

```typescript
import WebpackS3AssetsPlugin from 'webpack-s3-assets-plugin';
import { Configuration } from 'webpack';

const config: Configuration = {
  plugins: [
    new WebpackS3AssetsPlugin({
      s3Options: {
        region: 'us-west-2'
      },
      s3UploadOptions: {
        Bucket: 'my-bucket'
      },
      concurrency: 3,
      retries: 5,
      debug: process.env.NODE_ENV === 'development'
    })
  ]
};

export default config;
```

## Known Issues & Solutions

### AWS SDK v3 lib-storage Issues

This plugin was created specifically to avoid these known bugs in AWS SDK v3's `lib-storage`:

1. **Issue #7729** (Feb 2026): `Upload.done()` never resolves after large streaming upload
   - **Solution**: We use manual multipart upload instead of lib-storage
   
2. **Issue #5561** (Dec 2023): Multipart upload requests suddenly get stuck
   - **Solution**: Sequential part uploads with per-part timeout
   
3. **Issue #7179**: Memory leak with large files (>200MB)
   - **Solution**: Process parts sequentially, not in parallel

### Our Approach

- **Small files**: Use `PutObjectCommand` (simple, no streaming issues)
- **Large files**: Manual multipart upload with sequential part processing
  - Create multipart upload
  - Upload parts one by one (not parallel to avoid memory issues)
  - Complete multipart upload
  - Auto-abort on error to clean up

This approach is slightly slower than parallel uploads but much more reliable and avoids all known AWS SDK bugs.

## Examples

### Basic Example

```javascript
const WebpackS3AssetsPlugin = require('webpack-s3-assets-plugin');

module.exports = {
  plugins: [
    new WebpackS3AssetsPlugin({
      s3Options: {
        region: 'us-west-2',
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
        }
      },
      s3UploadOptions: {
        Bucket: 'my-bucket'
      }
    })
  ]
};
```

### Upload with Versioned Path

```javascript
new WebpackS3AssetsPlugin({
  s3Options: { region: 'us-west-2' },
  s3UploadOptions: {
    Bucket: 'my-bucket',
    ACL: 'public-read',
    CacheControl: 'max-age=31536000'
  },
  basePath: `dist/${process.env.npm_package_version}`,
  include: /\.(js|css|png|jpg|gif)$/,
  exclude: /\.map$/
})
```

### Video/Large File Upload

```javascript
new WebpackS3AssetsPlugin({
  s3Options: { region: 'us-west-2' },
  s3UploadOptions: { Bucket: 'my-video-bucket' },
  include: /\.(mp4|webm|mov)$/i,
  concurrency: 1,                       // Single file at a time
  timeout: 120000,                      // 2 min per part
  totalTimeout: 1800000,                // 30 min total
  multipartThreshold: 1 * 1024 * 1024,  // 1MB threshold
  partSize: 10 * 1024 * 1024,           // 10MB parts
  retries: 5
})
```

### Skip Existing Files

```javascript
new WebpackS3AssetsPlugin({
  s3Options: { region: 'us-west-2' },
  s3UploadOptions: { Bucket: 'my-bucket' },
  skipExistingFiles: true,  // Skip files already in S3 with same content
  debug: true               // See which files are skipped
})
```

See [examples/](examples/) directory for more complete configurations.

## Plugin Compatibility

This plugin is tested and confirmed compatible with:

| Plugin | Compatibility | Notes |
|--------|--------------|-------|
| [clean-webpack-plugin](https://github.com/johnagan/clean-webpack-plugin) | ✅ Full | Works correctly, cleanup happens before upload |
| [html-webpack-plugin](https://github.com/jantimon/html-webpack-plugin) | ✅ Full | HTML files are uploaded correctly |
| [mini-css-extract-plugin](https://github.com/webpack-contrib/mini-css-extract-plugin) | ✅ Full | CSS files are extracted and uploaded |
| [terser-webpack-plugin](https://github.com/webpack-contrib/terser-webpack-plugin) | ✅ Full | Minified files upload correctly |
| [copy-webpack-plugin](https://github.com/webpack-contrib/copy-webpack-plugin) | ✅ Full | Copied static assets are uploaded |
| [webpack-manifest-plugin](https://github.com/shellscape/webpack-manifest-plugin) | ✅ Full | Manifest file is uploaded |
| [webpack.DefinePlugin](https://webpack.js.org/plugins/define-plugin/) | ✅ Full | Environment variables work correctly |
| [webpack.ProgressPlugin](https://webpack.js.org/plugins/progress-plugin/) | ✅ Full | Progress tracking works together |

### Order Matters

When using with other plugins, ensure `WebpackS3AssetsPlugin` is added **after** plugins that generate assets:

```javascript
plugins: [
  new CleanWebpackPlugin(),
  new HtmlWebpackPlugin(),
  new MiniCssExtractPlugin(),
  // ... other asset-generating plugins
  new WebpackS3AssetsPlugin({
    // Upload happens after all assets are generated
  })
]
```

## Development

### Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/webpack-s3-assets-plugin.git
cd webpack-s3-assets-plugin

# Install dependencies
yarn install
```

### Running Tests

```bash
# Run all tests
yarn test

# Run tests in watch mode
yarn test:watch

# Run tests with coverage
yarn test:coverage

# Run specific test file
yarn test -- rate-limiter
```

### Linting

```bash
# Run ESLint
yarn lint

# Fix ESLint issues
yarn lint:fix
```

### E2E Tests with Real S3

Create `__tests__/.env` file:

```bash
AWS_ACCESS_KEY=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_BUCKET=your_bucket
AWS_REGION=us-east-1
```

Then run:

```bash
yarn test -- e2e-real-s3
```

See [__tests__/README.md](__tests__/README.md) for detailed testing documentation.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history and breaking changes.

## License

MIT © [webpack-s3-assets-plugin](https://github.com/yourusername/webpack-s3-assets-plugin)
