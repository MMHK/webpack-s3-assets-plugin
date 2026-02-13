const path = require('path');
const WebpackS3AssetsPlugin = require('../index.js');

// Example 1: Basic Usage
const basicConfig = {
  mode: 'production',
  entry: './src/index.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].[contenthash].js',
    clean: true
  },
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
        Bucket: process.env.S3_BUCKET || 'my-webpack-assets'
      }
    })
  ]
};

// Example 2: With Concurrency and Rate Limiting
const advancedConfig = {
  mode: 'production',
  entry: './src/index.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].[contenthash].js',
    clean: true
  },
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
        Bucket: process.env.S3_BUCKET || 'my-webpack-assets',
        ACL: 'public-read',
        CacheControl: 'public, max-age=31536000, immutable'
      },
      // Upload to versioned path
      basePath: `dist/${process.env.npm_package_version || 'v1.0.0'}`,
      
      // Only upload JS, CSS, and image files
      include: /\.(js|css|png|jpg|jpeg|gif|svg|woff|woff2)$/,
      
      // Exclude source maps and test files
      exclude: [/\.map$/, /\.test\./],
      
      // Limit to 3 concurrent uploads
      concurrency: 3,
      
      // Limit upload speed to 500 KB/s
      rateLimitKBps: 500,
      
      // Show progress bar
      progress: true
    })
  ]
};

// Example 3: With Dynamic Filters
const dynamicFilterConfig = {
  mode: 'production',
  entry: './src/index.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].[contenthash].js',
    clean: true
  },
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
        Bucket: process.env.S3_BUCKET || 'my-webpack-assets'
      },
      
      // Include only files larger than 1KB
      include: [
        /\.(js|css)$/,
        (filename) => {
          // Custom logic: only include main chunks
          return filename.includes('main') || filename.includes('vendor');
        }
      ],
      
      // Exclude files modified in last 5 minutes
      exclude: (filename) => {
        const fs = require('fs');
        const stats = fs.statSync(filename);
        const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
        return stats.mtimeMs > fiveMinutesAgo;
      }
    })
  ]
};

// Example 4: Multi-Environment Configuration
const getConfig = (env) => {
  const isProduction = env === 'production';
  
  return {
    mode: isProduction ? 'production' : 'development',
    entry: './src/index.js',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: isProduction ? '[name].[contenthash].js' : '[name].js',
      clean: true
    },
    plugins: [
      ...(isProduction ? [
        new WebpackS3AssetsPlugin({
          s3Options: {
            region: 'us-west-2',
            credentials: {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
            }
          },
          s3UploadOptions: {
            Bucket: isProduction ? 'prod-bucket' : 'staging-bucket',
            ACL: 'public-read'
          },
          basePath: isProduction ? 'production' : 'staging',
          concurrency: isProduction ? 10 : 3,
          rateLimitKBps: isProduction ? 0 : 1024,
          progress: true
        })
      ] : [])
    ]
  };
};

module.exports = process.env.ADVANCED 
  ? advancedConfig 
  : process.env.DYNAMIC
  ? dynamicFilterConfig
  : basicConfig;
