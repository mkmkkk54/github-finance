# Cloudflare Worker：网页一键更新数据

这个 Worker 的作用：保存 GitHub token，并在网页点击「更新数据」时安全触发 GitHub Actions。

## Cloudflare 控制台配置

1. Workers & Pages → Create → Worker。
2. 将 `trigger-github-action.js` 内容粘贴到 Worker 编辑器。
3. Settings → Variables：
   - Secret：`GITHUB_TOKEN`，填你的 GitHub token。
   - Variable：`GITHUB_OWNER` = `mkmkkk54`
   - Variable：`GITHUB_REPO` = `github-finance`
   - Variable：`GITHUB_WORKFLOW` = `update-and-deploy.yml`
   - Variable：`GITHUB_REF` = `main`
   - Variable：`ALLOWED_ORIGIN` = `https://mkmkkk54.github.io`
4. Deploy 后复制 Worker 地址，例如：`https://xxx.yyy.workers.dev`。
5. 回到本仓库，把 `assets/app.js` 顶部的 `WORKER_TRIGGER_URL` 改成 Worker 地址，提交并推送。

注意：不要把 GitHub token 写进网页代码或提交到 GitHub。
