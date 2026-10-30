# 《定解宝灯论》问答站

把 `dingjie-baodeng-lun` skill 和索达吉堪布《定解宝灯论讲解》（2003）转成一个纯静态问答网站：用户提问，页面在本地知识库中检索，给出简要回答、颂词原文、展开讲解与出处。无需后端、无需 API Key，可直接托管在 GitHub Pages。

## 回答方式

按优先级合成，不生成资料之外的内容：

1. **颂词卡**：用户引用颂词片段时，返回颂词原文、逐句讲解、展开详解与页码。
2. **精选问答 / 七难题 / 关键区分**：命中意图时返回整理好的简要答案、争议焦点，并附相关讲解段落。
3. **术语条目**：命中术语表时返回定义、相关章节与原文。
4. **讲解检索**：用中文分词 + BM25 检索 1,700 余段讲解与章节要点，抽取要点合成回答。
5. **低置信度**：不再硬答，列出可能相关的章节；完全无关时明确说未覆盖。

页面提供三套主题（纸白 / 护眼 / 夜读）、颂词索引、展开详解、查看原文、复制带问题的链接。

## 目录

```
.
├─ index.html                 页面
├─ style.css                  样式与主题
├─ app.js                     交互、渲染、URL 分享
├─ search-core.js             分词、BM25、回答合成（浏览器/Node 通用）
├─ data/kb.js                 构建产物（知识库）
├─ content/                   从 skill 同步的 Markdown
│  └─ lectures/               索达吉堪布 2003 讲解原文
├─ scripts/
│  ├─ build-kb.mjs            解析 Markdown + 讲解 -> data/kb.js
│  ├─ lib/parse-lectures.mjs  切章、识别颂词、重组讲解段
│  ├─ check.mjs               检索冒烟测试
│  ├─ eval.mjs                37 题问答回归
│  ├─ inspect-lectures.mjs    颂词/讲解抽检
│  └─ sync-content.sh         从 skill 目录同步内容并重建
├─ .github/workflows/pages.yml
└─ package.json
```

## 本地运行

需要 Node 18+ 和 Python 3（只用于起静态服务器）。

```bash
npm run build
npm run test
npm run eval
npm run serve
# 打开 http://localhost:8765
```

也可以直接用浏览器打开 `index.html`：知识库以 `window.KB` 形式加载，不依赖 `fetch`。

## 更新知识库

skill 更新后：

```bash
bash scripts/sync-content.sh
# 或指定路径
bash scripts/sync-content.sh /path/to/dingjie-baodeng-lun
```

脚本会复制 Markdown 到 `content/` 并重新生成 `data/kb.js`。讲解原文更新时，替换 `content/lectures/suodaji-2003.txt` 后重新 `npm run build` 即可；可用 `node scripts/inspect-lectures.mjs` 抽检颂词识别结果。

## 部署到 GitHub Pages

### 1. 创建仓库并推送

```bash
git init
git add .
git commit -m "init: 定解宝灯论问答站"
git branch -M main
gh repo create dingjie-qa --public --source=. --remote=origin --push
# 或手动 git remote add origin ...
```

### 2. 开启 Pages

仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。

推送到 `main` 后，`.github/workflows/pages.yml` 会自动构建、跑冒烟测试，并只把 `index.html`、样式、脚本和 `data/kb.js` 发布到 Pages（`content/` 等源文件不会出现在站点上）。

### 3. 访问

```
https://<用户名>.github.io/dingjie-qa/
```

项目页位于子路径，站内资源全部使用相对路径（`./...`），无需额外配置 base。

### 4. 更新

```bash
git add .
git commit -m "update knowledge base"
git push
```

## 发布前注意

- **版权**：麦彭仁波切颂词原文已属公版；索达吉堪布的译颂、益西彭措堪布的释文仍受版权保护。公开发布整篇内容可能有侵权风险。建议仓库私有（Pages 需 GitHub Pro）、或只公开自撰摘要与问答、或取得授权并完整署名。
- **内容定位**：页面已标注“仅供学习参考，非法师开示，不能替代闻思原文与依止善知识”。
- **无密钥**：本方案不调用任何在线模型，不存在密钥泄露问题。

## 已知限制

- 静态检索只能“抽取 + 重组”已有内容，不会推理生成新表述。
- 颂词由排版文本自动识别，个别地方会把讲解句误判为颂词，或漏掉分行不规则的半句；讲解检索不受影响。
- 中文分词使用浏览器 `Intl.Segmenter`，旧浏览器回退为二元组，召回略降。
- 知识库约 1.05 MB（GitHub Pages 会 gzip），首次加载后完全离线可用。
