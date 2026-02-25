/**
 * E2E Real S3 Upload Test
 * 使用真實 S3 憑證進行端到端測試
 *
 * 此測試會：
 * 1. 從 __tests__/.env 加載 S3 配置
 * 2. 在 S3 上創建臨時測試文件夾
 * 3. 執行 webpack 構建並上傳資產
 * 4. 驗證文件成功上傳到 S3
 * 5. 測試完成後清理所有 S3 文件
 *
 * 運行此測試：npm test -- __tests__/e2e-real-s3.test.js
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const webpack = require('webpack');
const { S3Client, ListObjectsV2Command, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');

// 加載 .env 配置
const dotenv = require('dotenv');
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log('[E2E Test] Loaded .env configuration from', envPath);
} else {
  console.warn('[E2E Test] .env file not found at', envPath);
}

const WebpackS3AssetsPlugin = require('../index.js');

// 檢查是否有必要的環境變量
const hasS3Config = process.env.AWS_ACCESS_KEY &&
                    process.env.AWS_SECRET_ACCESS_KEY &&
                    process.env.AWS_BUCKET &&
                    process.env.AWS_REGION;

// 生成唯一的測試文件夾名稱
const generateTestFolder = () => {
  const timestamp = Date.now();
  const random = crypto.randomBytes(4).toString('hex');
  return `test-e2e-${timestamp}-${random}`;
};

describe('E2E Real S3 Upload Test', () => {
  let s3Client;
  let testFolder;
  let tempDir;
  let uploadedKeys = [];

  // 跳過測試如果沒有 S3 配置
  const conditionalTest = hasS3Config ? it : it.skip;
  const conditionalBeforeAll = hasS3Config ? beforeAll : () => {};
  const conditionalAfterAll = hasS3Config ? afterAll : () => {};

  conditionalBeforeAll(async () => {
    if (!hasS3Config) {
      console.log('[E2E Test] Skipping - No S3 configuration found');
      return;
    }

    // 初始化 S3 客戶端
    s3Client = new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    });

    // 生成唯一的測試文件夾
    testFolder = generateTestFolder();
    console.log(`[E2E Test] Using S3 test folder: ${testFolder}`);

    // 創建臨時目錄
    tempDir = path.join(__dirname, 'temp', `e2e-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    console.log(`[E2E Test] Created temp directory: ${tempDir}`);
  }, 30000);

  conditionalAfterAll(async () => {
    if (!hasS3Config || !s3Client) {
      return;
    }

    console.log(`[E2E Test] Cleaning up ${uploadedKeys.length} uploaded files...`);

    // 清理 S3 上的測試文件
    const deletePromises = uploadedKeys.map(async (key) => {
      try {
        await s3Client.send(new DeleteObjectCommand({
          Bucket: process.env.AWS_BUCKET,
          Key: key
        }));
        console.log(`[E2E Test] Deleted: ${key}`);
      } catch (error) {
        console.error(`[E2E Test] Failed to delete ${key}:`, error.message);
      }
    });

    await Promise.all(deletePromises);

    // 清理臨時目錄
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      console.log(`[E2E Test] Cleaned up temp directory: ${tempDir}`);
    }

    // 銷毀 S3 客戶端
    if (s3Client) {
      s3Client.destroy();
    }

    console.log('[E2E Test] Cleanup completed');
  }, 60000);

  conditionalTest('should upload webpack assets to real S3 bucket', async () => {
    const bucket = process.env.AWS_BUCKET;
    const basePath = testFolder;

    // 創建測試入口文件
    const entryFile = path.join(tempDir, 'entry.js');
    const entryContent = `
      // Test entry file for E2E S3 upload
      console.log('Hello from E2E test!');
      
      // Simulate some code
      const data = {
        test: true,
        timestamp: ${Date.now()},
        message: 'This is a test file for S3 upload verification'
      };
      
      export default data;
    `;
    fs.writeFileSync(entryFile, entryContent);

    // 創建一個較大的 JS 文件來測試較大的文件上傳 (約 2MB)
    const largeCode = 'const data = "' + 'x'.repeat(2 * 1024 * 1024) + '";\nexport default data;';
    const largeJsFile = path.join(tempDir, 'large-data.js');
    fs.writeFileSync(largeJsFile, largeCode);

    // 配置 webpack
    const compiler = webpack({
      mode: 'production',
      entry: {
        main: entryFile,
        large: largeJsFile
      },
      output: {
        path: path.join(tempDir, 'dist'),
        filename: '[name].[contenthash].js',
        clean: true
      },
      plugins: [
        new WebpackS3AssetsPlugin({
          s3Options: {
            region: process.env.AWS_REGION,
            credentials: {
              accessKeyId: process.env.AWS_ACCESS_KEY,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
            }
          },
          s3UploadOptions: {
            Bucket: bucket,
            ACL: 'private'
          },
          basePath: basePath,
          progress: false, // 減少輸出噪聲
          debug: false,
          concurrency: 3,
          timeout: 120000,
          totalTimeout: 600000,
          retries: 3,
          multipartThreshold: 5 * 1024 * 1024, // 5MB
          continueOnError: false // E2E 測試中任何錯誤都應該失敗
        })
      ]
    });

    // 執行 webpack 構建
    console.log('[E2E Test] Starting webpack build...');

    const stats = await new Promise((resolve, reject) => {
      compiler.run((err, stats) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(stats);
      });
    });

    // 關閉 webpack compiler 釋放資源
    await new Promise((resolve, reject) => {
      compiler.close((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });

    // 檢查 webpack 構建結果
    if (stats.hasErrors()) {
      const info = stats.toJson();
      throw new Error(`Webpack build failed: ${info.errors.map(e => e.message).join('\n')}`);
    }

    console.log('[E2E Test] Webpack build completed successfully');

    // 等待一下確保 S3 最終一致性
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 驗證文件已上傳到 S3
    console.log('[E2E Test] Verifying uploaded files in S3...');

    const listCommand = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: basePath
    });

    const listResponse = await s3Client.send(listCommand);
    const s3Objects = listResponse.Contents || [];

    // 記錄上傳的文件用於清理
    uploadedKeys.push(...s3Objects.map(obj => obj.Key));

    console.log(`[E2E Test] Found ${s3Objects.length} files in S3 under ${basePath}:`);
    s3Objects.forEach(obj => {
      console.log(`  - ${obj.Key} (${formatBytes(obj.Size)})`);
    });

    // 驗證至少有一個文件被上傳
    expect(s3Objects.length).toBeGreaterThan(0);

    // 驗證每個文件都可以被讀取
    for (const obj of s3Objects) {
      const getCommand = new GetObjectCommand({
        Bucket: bucket,
        Key: obj.Key
      });

      const getResponse = await s3Client.send(getCommand);
      expect(getResponse.Body).toBeDefined();

      // 讀取並驗證內容
      const chunks = [];
      for await (const chunk of getResponse.Body) {
        chunks.push(chunk);
      }
      const content = Buffer.concat(chunks);

      // 驗證內容長度與 S3 返回的 Size 一致
      expect(content.length).toBe(obj.Size);
      console.log(`[E2E Test] Verified: ${obj.Key} - ${formatBytes(content.length)} readable`);
    }

    console.log('[E2E Test] All files verified successfully!');
  }, 300000); // 5分鐘超時

  conditionalTest('should upload with include/exclude filters', async () => {
    const bucket = process.env.AWS_BUCKET;
    const basePath = `${testFolder}/filtered`;

    // 創建測試入口文件
    const entryFile = path.join(tempDir, 'filtered-entry.js');
    fs.writeFileSync(entryFile, 'console.log("filtered test");');

    const compiler = webpack({
      mode: 'production',
      entry: entryFile,
      output: {
        path: path.join(tempDir, 'dist-filtered'),
        filename: '[name].js'
      },
      devtool: 'source-map', // 生成 .map 文件
      plugins: [
        new WebpackS3AssetsPlugin({
          s3Options: {
            region: process.env.AWS_REGION,
            credentials: {
              accessKeyId: process.env.AWS_ACCESS_KEY,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
            }
          },
          s3UploadOptions: {
            Bucket: bucket
          },
          basePath: basePath,
          include: /\.js$/,     // 只包含 .js 文件
          exclude: /\.map$/,    // 排除 .map 文件
          progress: false,
          debug: false
        })
      ]
    });

    console.log('[E2E Test] Testing with include/exclude filters...');

    const stats = await new Promise((resolve, reject) => {
      compiler.run((err, stats) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(stats);
      });
    });

    // 關閉 webpack compiler
    await new Promise((resolve, reject) => {
      compiler.close((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });

    if (stats.hasErrors()) {
      const info = stats.toJson();
      throw new Error(`Webpack build failed: ${info.errors.map(e => e.message).join('\n')}`);
    }

    // 等待 S3 最終一致性
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 驗證只上傳了 .js 文件
    const listCommand = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: basePath
    });

    const listResponse = await s3Client.send(listCommand);
    const s3Objects = listResponse.Contents || [];

    // 記錄上傳的文件
    uploadedKeys.push(...s3Objects.map(obj => obj.Key));

    console.log(`[E2E Test] Filtered upload found ${s3Objects.length} files:`);
    s3Objects.forEach(obj => {
      console.log(`  - ${obj.Key}`);
    });

    // 驗證所有上傳的文件都是 .js 而不是 .map
    s3Objects.forEach(obj => {
      expect(obj.Key).toMatch(/\.js$/);
      expect(obj.Key).not.toMatch(/\.map$/);
    });

    console.log('[E2E Test] Filter test passed!');
  }, 120000);

  conditionalTest('should handle skipExistingFiles option', async () => {
    const bucket = process.env.AWS_BUCKET;
    const basePath = `${testFolder}/skip-existing`;

    // 創建測試文件
    const entryFile = path.join(tempDir, 'skip-entry.js');
    fs.writeFileSync(entryFile, 'console.log("skip existing test");');

    // 第一次上傳
    const compiler1 = webpack({
      mode: 'production',
      entry: entryFile,
      output: {
        path: path.join(tempDir, 'dist-skip1'),
        filename: '[name].[contenthash].js'
      },
      plugins: [
        new WebpackS3AssetsPlugin({
          s3Options: {
            region: process.env.AWS_REGION,
            credentials: {
              accessKeyId: process.env.AWS_ACCESS_KEY,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
            }
          },
          s3UploadOptions: { Bucket: bucket },
          basePath: basePath,
          skipExistingFiles: true,
          progress: false,
          debug: true
        })
      ]
    });

    console.log('[E2E Test] First upload (should upload all files)...');

    await new Promise((resolve, reject) => {
      compiler1.run((err, stats) => {
        if (err) {
          reject(err);
        } else {
          resolve(stats);
        }
      });
    });

    // 關閉第一個 compiler
    await new Promise((resolve, reject) => {
      compiler1.close((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });

    await new Promise(resolve => setTimeout(resolve, 2000));

    // 第二次上傳（相同內容，應該跳過）
    const compiler2 = webpack({
      mode: 'production',
      entry: entryFile,
      output: {
        path: path.join(tempDir, 'dist-skip2'),
        filename: '[name].[contenthash].js'
      },
      plugins: [
        new WebpackS3AssetsPlugin({
          s3Options: {
            region: process.env.AWS_REGION,
            credentials: {
              accessKeyId: process.env.AWS_ACCESS_KEY,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
            }
          },
          s3UploadOptions: { Bucket: bucket },
          basePath: basePath,
          skipExistingFiles: true,
          progress: false,
          debug: true
        })
      ]
    });

    console.log('[E2E Test] Second upload (should skip existing files)...');

    // 捕獲控制台輸出以驗證跳過行為
    const logs = [];
    const originalLog = console.log;
    console.log = (...args) => {
      logs.push(args.join(' '));
      originalLog(...args);
    };

    try {
      await new Promise((resolve, reject) => {
        compiler2.run((err, stats) => {
          if (err) {
            reject(err);
          } else {
            resolve(stats);
          }
        });
      });

      // 關閉第二個 compiler
      await new Promise((resolve, reject) => {
        compiler2.close((err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });

      // 檢查是否有跳過提示
      const hasSkippedMessage = logs.some(log =>
        log.includes('already exists') || log.includes('Skipped')
      );

      console.log = originalLog;

      // 記錄文件用於清理
      const listCommand = new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: basePath
      });
      const listResponse = await s3Client.send(listCommand);
      uploadedKeys.push(...(listResponse.Contents || []).map(obj => obj.Key));

      console.log('[E2E Test] Skip existing files test completed');
    } catch (error) {
      console.log = originalLog;
      throw error;
    }
  }, 120000);
});

// 輔助函數：格式化字節大小
function formatBytes(bytes) {
  if (bytes === 0) {
    return '0 B';
  }
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 如果沒有 S3 配置，顯示警告
if (!hasS3Config) {
  console.warn('\n[E2E Test] WARNING: S3 configuration not found in .env file');
  console.warn('[E2E Test] Please ensure __tests__/.env contains:');
  console.warn('  AWS_ACCESS_KEY=your_access_key');
  console.warn('  AWS_SECRET_ACCESS_KEY=your_secret_key');
  console.warn('  AWS_BUCKET=your_bucket_name');
  console.warn('  AWS_REGION=your_region\n');
}
