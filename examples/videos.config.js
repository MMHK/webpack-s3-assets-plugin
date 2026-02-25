const WebpackS3AssetsPlugin = require('../index.js');
const path = require('path');

/**
 * Example: Uploading Large Video Files with Multipart Upload
 *
 * This configuration is optimized for uploading video files and other large assets
 * using manual multipart upload to avoid AWS SDK v3 lib-storage bugs.
 */

module.exports = {
  mode: 'production',
  entry: './src/index.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].[contenthash].js',
    clean: true
  },
  plugins: [
    new WebpackS3AssetsPlugin({
      // AWS Configuration
      s3Options: {
        region: process.env.AWS_REGION || 'us-west-2',
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
        }
      },

      s3UploadOptions: {
        Bucket: process.env.S3_BUCKET || 'my-video-bucket',
        ACL: 'public-read',
        CacheControl: 'public, max-age=31536000'
      },

      // Upload videos to specific folder
      basePath: 'videos/v1',

      // Only upload video files
      include: /\.(mp4|webm|ogg|mov|avi)$/i,

      // Single file upload for videos to avoid overwhelming connection
      concurrency: 1,

      // Timeout settings
      timeout: 120000,         // 2 minutes per part
      totalTimeout: 1800000,   // 30 minutes total

      // Multipart upload settings
      multipartThreshold: 1 * 1024 * 1024,  // Use multipart for files >1MB
      partSize: 10 * 1024 * 1024,           // 10MB parts (fewer parts = more reliable)

      // File size limits
      maxFileSize: 2 * 1024 * 1024 * 1024,  // 2GB max

      // More retries for unreliable connections
      retries: 5,
      retryDelay: 5000,  // 5 seconds between retries

      // Continue even if some videos fail
      continueOnError: true,

      // Show progress
      progress: true,
      debug: true
    })
  ]
};

/**
 * Example output for video upload:
 *
 * [WebpackS3AssetsPlugin] Starting upload of 3 files (245.67 MB) to S3:
 *   📄 Small files (<1 MB): 0 (PutObjectCommand)
 *   🎬 Large files (≥1 MB): 3 (Multipart Upload)
 *
 *   🎬 Multipart Upload: intro.mp4 (45.32 MB)
 *     Uploading part 1/5 (10.00 MB)
 *     📤 intro.mp4: 20% (10.00 MB/45.32 MB)
 *     Uploading part 2/5 (10.00 MB)
 *     📤 intro.mp4: 40% (20.00 MB/45.32 MB)
 *     ...
 *     Completing multipart upload: abc123def...
 *     ✅ Multipart upload completed: intro.mp4
 *
 *   🎬 Multipart Upload: main-video.mp4 (156.89 MB)
 *     Uploading part 1/16 (10.00 MB)
 *     📤 main-video.mp4: 6% (10.00 MB/156.89 MB)
 *     ...
 *     ✅ Multipart upload completed: main-video.mp4
 *
 * Uploading [████████████████████] 100% | 3/3 Files | Speed: 0.1 files/s
 *
 * [WebpackS3AssetsPlugin] Upload Summary (145.3s, 1.69 MB/s avg):
 *    ✅ Successfully uploaded: 3/3 files
 */

/**
 * Alternative: Skip videos and upload only small assets
 * Use this if videos should be uploaded separately via other means
 */
// eslint-disable-next-line no-unused-vars
const skipVideosConfig = {
  plugins: [
    new WebpackS3AssetsPlugin({
      s3Options: {
        region: process.env.AWS_REGION || 'us-west-2',
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
        }
      },
      s3UploadOptions: {
        Bucket: process.env.S3_BUCKET || 'my-assets-bucket'
      },

      // Only upload small assets (JS, CSS, images)
      include: /\.(js|css|png|jpg|jpeg|gif|svg|woff|woff2)$/,

      // Skip video files entirely
      exclude: /\.(mp4|webm|ogg|mov|avi)$/i,

      concurrency: 3,
      progress: true
    })
  ]
};

/**
 * Alternative: Skip files that are too large
 */
const skipLargeFilesConfig = {
  plugins: [
    new WebpackS3AssetsPlugin({
      s3Options: {
        region: process.env.AWS_REGION || 'us-west-2',
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
        }
      },
      s3UploadOptions: {
        Bucket: process.env.S3_BUCKET || 'my-assets-bucket'
      },

      // Skip files larger than 50MB instead of failing
      skipLargeFiles: true,
      maxFileSize: 50 * 1024 * 1024,  // 50MB

      concurrency: 3,
      progress: true,
      debug: true  // See which files were skipped
    })
  ]
};

module.exports = skipLargeFilesConfig;
