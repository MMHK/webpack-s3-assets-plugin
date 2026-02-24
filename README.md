# webpack-s3-assets-plugin

Modern webpack plugin for uploading assets to AWS S3 with enhanced features including concurrency control, rate limiting, retry logic, timeout handling, and progress bar. Uses **manual multipart upload** to work around AWS SDK v3 lib-storage bugs.

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

## License

MIT
