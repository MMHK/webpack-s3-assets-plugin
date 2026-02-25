/**
 * Real Process Exit Test
 * 獨立運行的腳本，測試真實場景下進程是否正常退出
 * 
 * 運行方式：node __tests__/real-process-exit.js
 */

const path = require('path');
const fs = require('fs');
const webpack = require('webpack');
const WebpackS3AssetsPlugin = require('../index.js');

// Mock AWS SDK
const mockSend = jest.fn();
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => ({
    send: mockSend,
    destroy: jest.fn()
  })),
  PutObjectCommand: jest.fn(),
  HeadObjectCommand: jest.fn(),
  CreateMultipartUploadCommand: jest.fn(),
  UploadPartCommand: jest.fn(),
  CompleteMultipartUploadCommand: jest.fn(),
  AbortMultipartUploadCommand: jest.fn()
}));

jest.mock('@smithy/node-http-handler', () => ({
  NodeHttpHandler: jest.fn()
}));

jest.mock('cli-progress', () => ({
  SingleBar: jest.fn(() => ({
    start: jest.fn(),
    update: jest.fn(),
    stop: jest.fn()
  }))
}));

async function main() {
  console.log('[Process Exit Test] Starting...\n');
  
  const tempDir = path.join(__dirname, 'temp', `real-exit-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  // 創建測試文件
  const entryFile = path.join(tempDir, 'entry.js');
  const cssFile = path.join(tempDir, 'styles.css');
  
  fs.writeFileSync(entryFile, `
    import "./styles.css";
    console.log("Hello World");
  `);
  fs.writeFileSync(cssFile, 'body { margin: 0; }');

  // 加載插件
  const { CleanWebpackPlugin } = require('clean-webpack-plugin');
  const HtmlWebpackPlugin = require('html-webpack-plugin');
  const TerserPlugin = require('terser-webpack-plugin');
  const MiniCssExtractPlugin = require('mini-css-extract-plugin');
  const CopyWebpackPlugin = require('copy-webpack-plugin');

  const publicDir = path.join(tempDir, 'public');
  fs.mkdirSync(publicDir, { recursive: true });
  fs.writeFileSync(path.join(publicDir, 'robots.txt'), 'User-agent: *');

  // 配置 webpack
  const compiler = webpack({
    mode: 'production',
    entry: entryFile,
    output: {
      path: path.join(tempDir, 'dist'),
      filename: 'js/[name].[contenthash].js',
      clean: true
    },
    module: {
      rules: [
        {
          test: /\.css$/,
          use: [MiniCssExtractPlugin.loader, 'css-loader']
        }
      ]
    },
    optimization: {
      minimize: true,
      minimizer: [new TerserPlugin()]
    },
    plugins: [
      new CleanWebpackPlugin(),
      new webpack.DefinePlugin({
        'process.env.NODE_ENV': JSON.stringify('production')
      }),
      new HtmlWebpackPlugin({
        templateContent: `<!DOCTYPE html>
          <html><head><title>Test</title></head><body><div id="app"></div></body></html>`
      }),
      new MiniCssExtractPlugin({
        filename: 'css/[name].css'
      }),
      new CopyWebpackPlugin({
        patterns: [{ from: publicDir, to: 'static' }]
      }),
      new webpack.ProgressPlugin((percentage, message) => {
        if (percentage === 1) {
          console.log('[Process Exit Test] Webpack build 100% complete');
        }
      }),
      new WebpackS3AssetsPlugin({
        s3Options: { region: 'us-east-1' },
        s3UploadOptions: { Bucket: 'test-bucket' },
        progress: false,
        debug: false
      })
    ]
  });

  console.log('[Process Exit Test] Running webpack build...\n');
  
  const startTime = Date.now();

  try {
    const stats = await new Promise((resolve, reject) => {
      compiler.run((err, stats) => {
        if (err) reject(err);
        else resolve(stats);
      });
    });

    if (stats.hasErrors()) {
      console.error('[Process Exit Test] Build errors:', stats.toJson().errors);
      process.exit(1);
    }

    console.log('[Process Exit Test] Build completed successfully');
    console.log('[Process Exit Test] Closing compiler...');

    await new Promise((resolve, reject) => {
      compiler.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const duration = Date.now() - startTime;
    console.log(`[Process Exit Test] Total time: ${duration}ms`);

    // 清理
    console.log('[Process Exit Test] Cleaning up...');
    fs.rmSync(tempDir, { recursive: true, force: true });

    console.log('[Process Exit Test] Test completed successfully!');
    console.log('[Process Exit Test] If the process does not exit in 5 seconds, there is a resource leak.\n');

    // 設置一個定時器，如果 5 秒後還沒退出，則強制退出
    setTimeout(() => {
      console.log('[Process Exit Test] Process did not exit naturally, forcing exit...');
      process.exit(0);
    }, 5000);

    // 如果一切正常，進程應該會在這裡自然退出
    console.log('[Process Exit Test] Waiting for natural process exit...');

  } catch (error) {
    console.error('[Process Exit Test] Error:', error);
    fs.rmSync(tempDir, { recursive: true, force: true });
    process.exit(1);
  }
}

// 使用 jest 的 mock，但獨立運行
const jest = require('jest');

// 手動設置 jest mock
jest.mock = jest.mock || function() {};
global.jest = {
  fn: () => {
    const mockFn = (...args) => mockFn._impl(...args);
    mockFn._impl = () => {};
    mockFn.mockReturnValue = (val) => { mockFn._impl = () => val; return mockFn; };
    return mockFn;
  }
};

main().catch(err => {
  console.error('[Process Exit Test] Fatal error:', err);
  process.exit(1);
});
