# 发布到 GitHub（3 分钟，不用装 git）

仓库名：**mech-drawing-teacher**　用户名：**cxdw666**　待上传：**83 个文件 / 4.7 MB**

---

## 第一步：拿一个 token（1 分钟）

1. 打开 https://github.com/settings/tokens → **Generate new token (classic)**
2. Note 随便写（如 `mech-upload`），Expiration 选 **7 days**
3. 勾选 **`repo`**（这一项就够：建库 + 写文件 + 开 Pages）
4. 生成后**立刻复制**那串 `ghp_...`（只显示一次）

> 用完就在同一页面点 Delete，别长期留着。

---

## 第二步：跑一条命令（30 秒）

在仓库目录执行：

**PowerShell**
```powershell
cd C:\Users\chash\Desktop\mech-drawing-teacher
$env:GITHUB_TOKEN="ghp_把这里换成你的token"
node tools/push-github.mjs
```

**Git Bash / CMD**
```bash
cd /c/Users/chash/Desktop/mech-drawing-teacher
GITHUB_TOKEN=ghp_把这里换成你的token node tools/push-github.mjs
```

脚本会：建仓库 → 逐个上传 83 个文件 → 自动开启 GitHub Pages → 打印三个链接。

---

## 第三步：等 1–2 分钟

Pages 首次构建需要一点时间，然后：

| 用途 | 地址 |
|---|---|
| 仓库 | `https://github.com/cxdw666/mech-drawing-teacher` |
| 落地页 | `https://cxdw666.github.io/mech-drawing-teacher/` |
| **手机可看的 3D** | `https://cxdw666.github.io/mech-drawing-teacher/viewer/pages/model-auto-5-1.html` |

**这个地址不需要你的电脑开机**，4G、别人的手机、发给同学都能直接打开。

---

## 如果脚本报错

| 报错 | 原因 | 处理 |
|---|---|---|
| `缺少 GITHUB_TOKEN` | 环境变量没设 | PowerShell 用 `$env:GITHUB_TOKEN="..."`，Bash 用 `GITHUB_TOKEN=... node ...` |
| `401` | token 错误或已过期 | 重新生成 |
| `403` | token 没勾 `repo` | 重新生成并勾上 |
| `404` 建库失败 | 用户名写错 | 脚本默认 `cxdw666`，可用 `REPO_OWNER=xxx` 覆盖 |
| 部分文件失败 | 网络抖动 | 直接重跑，脚本会自动覆盖已存在的文件 |

---

## 备选：完全不碰命令行

1. 打开 https://github.com/new → Repository name 填 `mech-drawing-teacher` → Public → Create
2. 进入新仓库 → **uploading an existing file** → 把整个 `mech-drawing-teacher` 文件夹拖进去（拖文件夹可以保留子目录）
3. Commit
4. Settings → Pages → Source 选 `main` / `/ (root)` → Save

代价：文件多，网页上传可能要分两三次；且文件多时容易漏目录。
