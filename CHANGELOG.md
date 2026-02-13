# CHANGELOG

所有重要的更改都会记录在这个文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.0.0/)，
并且本项目遵循 [Semantic Versioning](https://semver.org/lang/zh-TW/)。

## [1.0.0] - 2026-02-13

### 新增
- 實現 webpack-s3-assets-plugin 插件
- 支援 webpack 4/5 兼容性
- 小文件使用 PutObjectCommand 直接上傳
- 大文件使用手動 Multipart Upload 避免 AWS SDK v3 lib-storage bug
- 實現併發控制 (p-limit)
- 實現重試機制 (指數退避)
- 實現超時處理
- 添加速率限制功能
- 添加進度條顯示
- 支援 TypeScript 類型定義
- 添加詳細文檔和使用示例
- 使用 Yarn v4 作為包管理器
- 添加 GitHub Actions 自動發布

### 修復
- 繞過 AWS SDK v3 lib-storage 已知 bug
  - Issue #7729: Upload.done() 永不 resolve
  - Issue #5561: Multipart 上傳卡住
  - Issue #7179: 大文件記憶體洩漏

[1.0.0]: https://github.com/yourusername/webpack-s3-assets-plugin/releases/tag/v1.0.0
