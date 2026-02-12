# 秘密共享 · Offline-First

门限秘密共享 SPA：本地加密、拆分与还原，支持离线使用。

## 本地开发

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
```

产物在 `dist/`，可直接用任意静态服务器托管。

## 部署到 GitHub Pages

1. 将仓库推送到 GitHub。
2. 在仓库 **Settings → Pages** 中：
   - **Source** 选择 **GitHub Actions**。
3. 推送 `main` 或 `master` 分支后，Actions 会自动构建并部署。
4. 站点地址：`https://<你的用户名>.github.io/<仓库名>/`。

本地构建与 GitHub Actions 均使用 Vite 的 `base: './'`，在 GitHub Pages 子路径下资源可正常加载。
