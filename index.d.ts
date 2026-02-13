import { Compiler } from 'webpack';
import { S3ClientConfig } from '@aws-sdk/client-s3';

export interface WebpackS3AssetsPluginOptions {
  /**
   * AWS S3 client configuration options
   * @see https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-s3/interfaces/s3clientconfig.html
   */
  s3Options?: S3ClientConfig;

  /**
   * S3 upload options for PutObject command
   * @see https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-s3/interfaces/putobjectcommandinput.html
   */
  s3UploadOptions?: {
    Bucket: string;
    ACL?: string;
    CacheControl?: string;
    ContentDisposition?: string;
    ContentEncoding?: string;
    Expires?: Date;
    Metadata?: Record<string, string>;
    ServerSideEncryption?: string;
    StorageClass?: string;
    [key: string]: any;
  };

  /**
   * Base path for uploaded files in S3 bucket
   * @default ''
   */
  basePath?: string;

  /**
   * Function or RegExp to exclude files from upload
   * Can be a function that receives filename and returns boolean,
   * a RegExp, or an array of either
   */
  exclude?: RegExp | ((filename: string) => boolean) | Array<RegExp | ((filename: string) => boolean)>;

  /**
   * Function or RegExp to include only specific files for upload
   * Can be a function that receives filename and returns boolean,
   * a RegExp, or an array of either
   */
  include?: RegExp | ((filename: string) => boolean) | Array<RegExp | ((filename: string) => boolean)>;

  /**
   * Whether to show progress bar during upload
   * @default true
   */
  progress?: boolean;

  /**
   * Maximum number of concurrent uploads
   * @default 3
   */
  concurrency?: number;

  /**
   * Rate limit in KB/s (0 means no limit)
   * @default 0
   */
  rateLimitKBps?: number;

  /**
   * Single file upload timeout in milliseconds
   * @default 60000
   */
  timeout?: number;

  /**
   * Total upload timeout for all files in milliseconds
   * @default 600000
   */
  totalTimeout?: number;

  /**
   * Number of retry attempts for failed uploads
   * @default 3
   */
  retries?: number;

  /**
   * Initial delay between retries in milliseconds
   * @default 2000
   */
  retryDelay?: number;

  /**
   * Whether to continue uploading other files when one fails
   * @default true
   */
  continueOnError?: boolean;

  /**
   * Enable debug logging
   * @default false
   */
  debug?: boolean;

  /**
   * File size threshold (in bytes) for switching to multipart upload
   * Files smaller than this use PutObjectCommand, larger use multipart upload
   * @default 5242880 (5MB)
   */
  multipartThreshold?: number;

  /**
   * Part size in bytes for multipart upload
   * @default 5242880 (5MB)
   */
  partSize?: number;

  /**
   * Maximum file size in bytes (files larger than this will fail or be skipped)
   * @default 5368709120 (5GB)
   */
  maxFileSize?: number;

  /**
   * Skip files larger than maxFileSize instead of failing
   * @default false
   */
  skipLargeFiles?: boolean;
}

export default class WebpackS3AssetsPlugin {
  constructor(options?: WebpackS3AssetsPluginOptions);
  apply(compiler: Compiler): void;
}
