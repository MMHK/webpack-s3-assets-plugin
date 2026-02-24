const { 
  S3Client, 
  PutObjectCommand, 
  HeadObjectCommand,
  CreateMultipartUploadCommand, 
  UploadPartCommand, 
  CompleteMultipartUploadCommand, 
  AbortMultipartUploadCommand 
} = require('@aws-sdk/client-s3');
const { NodeHttpHandler } = require('@smithy/node-http-handler');
const pLimit = require('p-limit');
const cliProgress = require('cli-progress');
const mime = require('mime-types');
const path = require('path');
const https = require('https');
const http = require('http');
const crypto = require('crypto');

const PLUGIN_NAME = 'WebpackS3AssetsPlugin';

// Utility to add timeout to any promise
function withTimeout(promise, timeoutMs, errorMessage) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(errorMessage || `Timeout after ${timeoutMs}ms`)), timeoutMs);
    })
  ]);
}

class RateLimiter {
  constructor(rateLimitKBps) {
    this.rateLimitBytes = rateLimitKBps * 1024;
    this.tokens = this.rateLimitBytes;
    this.lastRefill = Date.now();
    this.refillRate = this.rateLimitBytes / 1000;
  }

  async consume(bytes) {
    if (!this.rateLimitBytes) return;

    this.refill();
    
    while (this.tokens < bytes) {
      const waitTime = Math.ceil((bytes - this.tokens) / this.refillRate);
      await this.sleep(waitTime);
      this.refill();
    }
    
    this.tokens -= bytes;
  }

  refill() {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    this.tokens = Math.min(
      this.rateLimitBytes,
      this.tokens + (elapsed * this.refillRate)
    );
    this.lastRefill = now;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

class WebpackS3AssetsPlugin {
  constructor(options = {}) {
    this.options = {
      s3Options: {},
      s3UploadOptions: {},
      basePath: '',
      exclude: null,
      include: null,
      progress: true,
      concurrency: 3,
      rateLimitKBps: 0,
      // Timeout and retry options
      timeout: 60000,
      totalTimeout: 600000,
      retries: 3,
      retryDelay: 2000,
      continueOnError: true,
      debug: false,
      // File size options
      multipartThreshold: 5 * 1024 * 1024,  // 5MB threshold
      partSize: 5 * 1024 * 1024,            // 5MB parts for multipart
      maxFileSize: 5 * 1024 * 1024 * 1024,  // 5GB max
      skipLargeFiles: false,
      // Skip existing files based on hash comparison
      skipExistingFiles: false,
      ...options
    };

    this.s3Client = null;
    this.rateLimiter = null;
    this.progressBar = null;
    this.failedUploads = [];
    this.successCount = 0;
    this.skippedCount = 0;
    this.skippedExistingCount = 0;
    this.startTime = 0;
  }

  getContentMD5(buffer) {
    return crypto.createHash('md5').update(buffer).digest('hex');
  }

  // Calculate S3 multipart ETag (md5-of-md5s)
  getMultipartETag(buffer, partSize) {
    const numParts = Math.ceil(buffer.length / partSize);
    const md5s = [];
    
    for (let i = 0; i < numParts; i++) {
      const start = i * partSize;
      const end = Math.min(start + partSize, buffer.length);
      const partBuffer = buffer.slice(start, end);
      const partMD5 = crypto.createHash('md5').update(partBuffer).digest();
      md5s.push(partMD5);
    }
    
    const combined = Buffer.concat(md5s);
    const finalMD5 = crypto.createHash('md5').update(combined).digest('hex');
    return `${finalMD5}-${numParts}`;
  }

  getS3Key(fileName) {
    return this.options.basePath 
      ? path.posix.join(this.options.basePath, fileName)
      : fileName;
  }

  async checkFileExists(key, localMD5) {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.options.s3UploadOptions.Bucket,
        Key: key
      });
      const response = await this.s3Client.send(command);
      const remoteETag = response.ETag?.replace(/"/g, '');
      return remoteETag === localMD5;
    } catch (error) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  log(...args) {
    if (this.options.debug) {
      console.log('[WebpackS3AssetsPlugin:DEBUG]', ...args);
    }
  }

  apply(compiler) {
    const webpack = compiler.webpack || require('webpack');
    const isWebpack5 = !!compiler.webpack;

    if (isWebpack5) {
      compiler.hooks.compilation.tap(PLUGIN_NAME, (compilation) => {
        const { Compilation } = webpack;
        
        compilation.hooks.processAssets.tapAsync(
          {
            name: PLUGIN_NAME,
            stage: Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_TRANSFER
          },
          (assets, callback) => {
            this.collectAndUploadAssets(compilation, assets, webpack)
              .then(() => callback())
              .catch(error => callback(error));
          }
        );
      });
    } else {
      compiler.hooks.emit.tapAsync(PLUGIN_NAME, (compilation, callback) => {
        this.collectAndUploadAssets(compilation, compilation.assets, webpack)
          .then(() => callback())
          .catch(error => callback(error));
      });
    }
  }

  async collectAndUploadAssets(compilation, assets) {
    const files = this.getAssets(compilation, assets);
    
    if (files.length === 0) {
      console.log('[WebpackS3AssetsPlugin] No files to upload');
      return;
    }

    const largeFiles = files.filter(f => f.size >= this.options.multipartThreshold);
    const smallFiles = files.filter(f => f.size < this.options.multipartThreshold);
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    
    console.log(`\n[WebpackS3AssetsPlugin] Starting upload of ${files.length} files (${this.formatBytes(totalSize)}) to S3:`);
    console.log(`  📄 Small files (<${this.formatBytes(this.options.multipartThreshold)}): ${smallFiles.length} (PutObjectCommand)`);
    console.log(`  🎬 Large files (≥${this.formatBytes(this.options.multipartThreshold)}): ${largeFiles.length} (Multipart Upload)`);
    
    this.startTime = Date.now();

    // Initialize S3 client with connection pool
    const requestHandler = new NodeHttpHandler({
      connectionTimeout: 30000,
      socketTimeout: 300000,
      maxSockets: this.options.concurrency * 3,
      httpAgent: new http.Agent({
        maxSockets: this.options.concurrency * 3,
        keepAlive: true,
        keepAliveMsecs: 60000,
        timeout: 300000
      }),
      httpsAgent: new https.Agent({
        maxSockets: this.options.concurrency * 3,
        keepAlive: true,
        keepAliveMsecs: 60000,
        timeout: 300000,
        rejectUnauthorized: true
      })
    });

    this.s3Client = new S3Client({
      ...this.options.s3Options,
      requestHandler
    });

    this.failedUploads = [];
    this.successCount = 0;
    this.skippedCount = 0;
    this.skippedExistingCount = 0;
    
    if (this.options.rateLimitKBps > 0) {
      this.rateLimiter = new RateLimiter(this.options.rateLimitKBps);
    }

    const limit = pLimit(this.options.concurrency);
    const totalFiles = files.length;
    let processedCount = 0;

    if (this.options.progress) {
      this.progressBar = new cliProgress.SingleBar({
        format: 'Uploading [{bar}] {percentage}% | {value}/{total} Files | {speed}',
        barCompleteChar: '\u2588',
        barIncompleteChar: '\u2591',
        hideCursor: true,
        stopOnComplete: true,
        clearOnComplete: false
      });
      this.progressBar.start(totalFiles, 0, { speed: 'calculating...' });
    }

    let lastUpdateTime = Date.now();
    let lastUpdateCount = 0;

    const updateProgress = () => {
      processedCount++;
      
      const now = Date.now();
      const timeDiff = (now - lastUpdateTime) / 1000;
      if (timeDiff >= 1) {
        const filesDiff = processedCount - lastUpdateCount;
        const speed = filesDiff / timeDiff;
        lastUpdateTime = now;
        lastUpdateCount = processedCount;
        
        if (this.progressBar) {
          this.progressBar.update(processedCount, { 
            speed: `${speed.toFixed(1)} files/s`
          });
        }
      } else if (this.progressBar) {
        this.progressBar.update(processedCount);
      }
    };

    // Create upload tasks
    const uploadTasks = files.map((file) => 
      limit(async () => {
        this.log(`Starting: ${file.name} (${this.formatBytes(file.size)})`);
        
        try {
          if (file.size < this.options.multipartThreshold) {
            await this.uploadSmallFile(file);
          } else {
            await this.uploadLargeFile(file);
          }
          this.successCount++;
        } catch (error) {
          this.log(`Failed: ${file.name} - ${error.message}`);
        } finally {
          updateProgress();
        }
      })
    );

    try {
      const uploadPromise = Promise.allSettled(uploadTasks);
      await withTimeout(uploadPromise, this.options.totalTimeout, 'Total upload timeout');
      
      if (this.progressBar) {
        this.progressBar.stop();
        this.progressBar = null;
      }

      const duration = ((Date.now() - this.startTime) / 1000).toFixed(1);
      const avgSpeed = (totalSize / 1024 / 1024 / (duration || 1)).toFixed(2);

      // Summary
      console.log(`\n[WebpackS3AssetsPlugin] Upload Summary (${duration}s, ${avgSpeed} MB/s avg):`);
      console.log(`   ✅ Successfully uploaded: ${this.successCount}/${totalFiles} files`);
      
      if (this.skippedExistingCount > 0) {
        console.log(`   ⏭️  Skipped (already exists): ${this.skippedExistingCount} files`);
      }
      
      if (this.skippedCount > 0) {
        console.log(`   ⊘ Skipped (too large): ${this.skippedCount} files`);
      }
      
      if (this.failedUploads.length > 0) {
        console.log(`   ❌ Failed: ${this.failedUploads.length} files`);
        
        if (this.failedUploads.length <= 5) {
          console.log('\n   Failed details:');
          this.failedUploads.forEach(({ file, error, size }) => {
            console.log(`     - ${file} (${size}): ${error}`);
          });
        }

        if (!this.options.continueOnError) {
          throw new Error(`${this.failedUploads.length} file(s) failed to upload`);
        }
      }
    } catch (error) {
      if (this.progressBar) {
        this.progressBar.stop();
        this.progressBar = null;
      }
      throw error;
    } finally {
      // Destroy S3 client to release HTTP connections
      if (this.s3Client) {
        this.s3Client.destroy();
        this.s3Client = null;
      }
    }
  }

  async uploadSmallFile(file) {
    const { retries, retryDelay, maxFileSize, skipLargeFiles, skipExistingFiles } = this.options;
    const key = this.getS3Key(file.name);
    
    if (file.size > maxFileSize) {
      if (skipLargeFiles) {
        this.log(`  ⊘ Skipping ${file.name}: exceeds ${this.formatBytes(maxFileSize)}`);
        this.skippedCount++;
        return;
      }
      throw new Error(`File exceeds maximum size of ${this.formatBytes(maxFileSize)}`);
    }
    
    if (skipExistingFiles) {
      const localMD5 = this.getContentMD5(file.content);
      const exists = await this.checkFileExists(key, localMD5);
      if (exists) {
        this.log(`  ⏭️  Skipping ${file.name}: already exists with same content`);
        this.skippedExistingCount++;
        return;
      }
    }

    const contentType = mime.lookup(file.name) || 'application/octet-stream';
    
    const uploadParams = {
      ...this.options.s3UploadOptions,
      Key: key,
      Body: file.content,
      ContentType: contentType,
      ContentLength: file.size
    };

    if (this.rateLimiter) {
      await this.rateLimiter.consume(file.size);
    }

    // Simple retry loop for small files using PutObjectCommand
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        this.log(`  📄 PutObjectCommand: ${file.name} (attempt ${attempt + 1})`);

        const command = new PutObjectCommand(uploadParams);
        await withTimeout(
          this.s3Client.send(command),
          this.options.timeout,
          `PutObject timeout for ${file.name}`
        );

        this.log(`  ✅ PutObjectCommand: ${file.name} completed`);
        return;
      } catch (error) {
        if (attempt === retries) {
          console.error(`  ❌ PutObjectCommand: ${file.name} failed after ${retries + 1} attempts: ${error.message}`);
          this.failedUploads.push({
            file: file.name,
            error: error.message,
            size: this.formatBytes(file.size)
          });
          throw error;
        }

        this.log(`  ⚠️  PutObjectCommand: ${file.name} attempt ${attempt + 1} failed, retrying...`);
        await this.sleep(retryDelay * Math.pow(2, attempt));
      }
    }
  }

  async uploadLargeFile(file) {
    const { retries, retryDelay, maxFileSize, skipLargeFiles, skipExistingFiles, partSize } = this.options;
    const key = this.getS3Key(file.name);
    
    if (file.size > maxFileSize) {
      if (skipLargeFiles) {
        console.log(`  ⊘ Skipping ${file.name}: exceeds ${this.formatBytes(maxFileSize)}`);
        this.skippedCount++;
        return;
      }
      throw new Error(`File exceeds maximum size of ${this.formatBytes(maxFileSize)}`);
    }

    if (skipExistingFiles) {
      // For multipart uploads, S3 ETag is not a simple MD5, it's md5-of-md5s
      const localETag = this.getMultipartETag(file.content, partSize);
      const exists = await this.checkFileExists(key, localETag);
      if (exists) {
        this.log(`  ⏭️  Skipping ${file.name}: already exists with same content`);
        this.skippedExistingCount++;
        return;
      }
    }

    const contentType = mime.lookup(file.name) || 'application/octet-stream';
    
    console.log(`\n  🎬 Multipart Upload: ${file.name} (${this.formatBytes(file.size)})`);

    let uploadId = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        this.log(`  Multipart upload attempt ${attempt + 1}/${retries + 1}`);
        
        // Step 1: Create multipart upload
        const createCommand = new CreateMultipartUploadCommand({
          ...this.options.s3UploadOptions,
          Key: key,
          ContentType: contentType
        });
        
        const createResponse = await withTimeout(
          this.s3Client.send(createCommand),
          30000,
          'CreateMultipartUpload timeout'
        );
        
        uploadId = createResponse.UploadId;
        this.log(`  Created multipart upload: ${uploadId}`);
        
        // Step 2: Upload parts
        const numParts = Math.ceil(file.size / partSize);
        const parts = [];
        let uploadedBytes = 0;
        
        for (let partNumber = 1; partNumber <= numParts; partNumber++) {
          const start = (partNumber - 1) * partSize;
          const end = Math.min(start + partSize, file.size);
          const partBuffer = file.content.slice(start, end);
          
          this.log(`  Uploading part ${partNumber}/${numParts} (${this.formatBytes(partBuffer.length)})`);
          
          const uploadPartCommand = new UploadPartCommand({
            ...this.options.s3UploadOptions,
            Key: key,
            UploadId: uploadId,
            PartNumber: partNumber,
            Body: partBuffer
          });
          
          const uploadPartResponse = await withTimeout(
            this.s3Client.send(uploadPartCommand),
            this.options.timeout * 2,
            `UploadPart timeout for part ${partNumber}`
          );
          
          parts.push({
            PartNumber: partNumber,
            ETag: uploadPartResponse.ETag
          });
          
          uploadedBytes += partBuffer.length;
          const percent = Math.round((uploadedBytes / file.size) * 100);
          
          // Show progress every 10%
          if (partNumber === numParts || percent % 10 === 0) {
            console.log(`  📤 ${file.name}: ${percent}% (${this.formatBytes(uploadedBytes)}/${this.formatBytes(file.size)})`);
          }
          
          if (this.rateLimiter) {
            await this.rateLimiter.consume(partBuffer.length);
          }
        }
        
        // Step 3: Complete multipart upload
        this.log(`  Completing multipart upload: ${uploadId}`);
        
        const completeCommand = new CompleteMultipartUploadCommand({
          ...this.options.s3UploadOptions,
          Key: key,
          UploadId: uploadId,
          MultipartUpload: { Parts: parts }
        });
        
        await withTimeout(
          this.s3Client.send(completeCommand),
          60000,
          'CompleteMultipartUpload timeout'
        );
        
        console.log(`  ✅ Multipart upload completed: ${file.name}`);
        return;
        
      } catch (error) {
        // Abort multipart upload on error
        if (uploadId) {
          try {
            this.log(`  Aborting multipart upload: ${uploadId}`);
            await this.s3Client.send(new AbortMultipartUploadCommand({
              ...this.options.s3UploadOptions,
              Key: key,
              UploadId: uploadId
            }));
          } catch (abortError) {
            this.log(`  Failed to abort multipart upload: ${abortError.message}`);
          }
        }
        
        if (attempt === retries) {
          console.error(`  ❌ Multipart upload failed for ${file.name} after ${retries + 1} attempts: ${error.message}`);
          this.failedUploads.push({
            file: file.name,
            error: error.message,
            size: this.formatBytes(file.size)
          });
          throw error;
        }

        console.warn(`  ⚠️  Multipart upload attempt ${attempt + 1}/${retries + 1} failed for ${file.name}: ${error.message}. Retrying...`);
        
        const delay = retryDelay * Math.pow(2, attempt) + Math.random() * 1000;
        await this.sleep(delay);
      }
    }
  }

  getAssets(compilation, assets) {
    const result = [];
    const assetNames = Object.keys(assets);
    
    this.log(`Found ${assetNames.length} assets`);
    
    for (const name of assetNames) {
      if (this.options.exclude && this.matchRule(name, this.options.exclude)) {
        this.log(`Excluded: ${name}`);
        continue;
      }
      if (this.options.include && !this.matchRule(name, this.options.include)) {
        continue;
      }

      try {
        let source;
        
        if (compilation.getAsset) {
          const assetInfo = compilation.getAsset(name);
          if (!assetInfo || !assetInfo.source) {
            continue;
          }
          source = assetInfo.source.source();
        } else {
          const asset = assets[name];
          if (!asset) {
            continue;
          }
          source = asset.source();
        }
        
        let buffer;
        if (Buffer.isBuffer(source)) {
          buffer = source;
        } else if (typeof source === 'string') {
          buffer = Buffer.from(source, 'utf8');
        } else if (source && typeof source === 'object') {
          buffer = Buffer.from(source);
        } else {
          this.log(`Skipping ${name}: unsupported source type`, typeof source);
          continue;
        }
        
        result.push({
          name,
          content: buffer,
          size: buffer.length
        });
      } catch (error) {
        this.log(`Skipping ${name}: ${error.message}`);
        continue;
      }
    }
    
    return result;
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  matchRule(filename, rule) {
    if (typeof rule === 'function') {
      return rule(filename);
    }
    if (rule instanceof RegExp) {
      return rule.test(filename);
    }
    if (Array.isArray(rule)) {
      return rule.every(r => this.matchRule(filename, r));
    }
    return false;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = WebpackS3AssetsPlugin;
