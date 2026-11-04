# Builds public/guide.html from the narration script and the FAQ list.
# Usage: python3 tools/build_guide.py tools/讲解稿.md public/guide.html tools/faq.json
# Builds public/guide.html from 讲解稿.md (one section per "## [m:ss] title", bullets as points).
import re, html, sys
src, out, faq_src = sys.argv[1], sys.argv[2], sys.argv[3]
import json
SRC = {'rb': ('规则书', 'https://cdn.shopify.com/s/files/1/0246/2190/8043/files/Brass-P-Rulebook-ENG.pdf'),
       'dd': ('开发日志', 'https://gamefound.com/en/projects/roxley/brass-pittsburgh/updates/7')}
faq = json.load(open(faq_src))
cats = list(dict.fromkeys(f['cat'] for f in faq))
faq_html = ''.join(f'<h3 class="fq-cat">{html.escape(c)}</h3>' + ''.join(
    f'<details class="card fq"><summary>{html.escape(f["q"])}</summary><p>{html.escape(f["a"])} <a href="{SRC[f["src"]][1]}" target="_blank" rel="noopener">来源：{SRC[f["src"]][0]}</a></p></details>'
    for f in faq if f['cat'] == c) for c in cats)
secs = re.findall(r'^## \[[\d:]+\] (.+?)\n(.*?)(?=^## |\Z)', open(src).read(), re.M | re.S)
toc = '<a class="fqa" href="#faq">常见问题</a>' + ''.join(f'<a href="#s{i}">{html.escape(t)}</a>' for i, (t, _) in enumerate(secs, 1))
body = ''
for i, (t, b) in enumerate(secs, 1):
    pts = ''.join(f'<li>{html.escape(x)}</li>' for x in re.findall(r'^- (.+)$', b, re.M))
    body += f'''<section class="card gs" id="s{i}"><h2 class="h"><span><i>{i:02d}</i>{html.escape(t)}</span></h2>
<img src="guide/{i:02d}.jpg" width="800" height="394" alt="{html.escape(t)}" loading="{'eager' if i < 3 else 'lazy'}"><ul>{pts}</ul></section>\n'''
open(out, 'w').write(f'''<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#1b2230">
<title>新手教程 · 工业革命：匹兹堡</title>
<meta property="og:title" content="新手教程 · 工业革命：匹兹堡">
<meta property="og:image" content="https://pgh.leisurecat.cloud/img/icon-512.jpg">
<link rel="icon" href="img/icon-64.png">
<link rel="apple-touch-icon" href="img/icon-180.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600&family=Noto+Serif+SC:wght@600;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="style.css">
</head>
<body>
<div style="position:absolute;width:0;height:0;overflow:hidden"><img src="img/icon-512.jpg" alt=""></div>
<div class="hero nav-hero"><a class="back-nav" href="/" data-html2canvas-ignore>‹ 返回</a><div class="en">工业革命 · 匹兹堡</div><h1>新手教程</h1><div class="orn"></div></div><div class="band"></div>
<div class="wrap guide">
<h2 class="h">视频讲解<small>9 分 29 秒</small></h2>
<video class="card vid" controls playsinline preload="none" poster="img/rules-poster.jpg" src="/media/rules.mp4"></video>
<h2 class="h">图文讲解</h2>
<nav class="toc">{toc}</nav>
{body}<h2 class="h" id="faq">常见问题<small>{len(faq)} 条</small></h2>
<p class="note">官方暂未发布 FAQ 或勘误，以下依据官方规则书 v2026.01 整理，点开查看答案。</p>
{faq_html}
<a class="btn" href="./">返回首页</a>
<footer>依据官方规则书 v2026.01 · 非官方玩家工具</footer>
</div>
<script type="module" src="chat.js"></script>
</body>
</html>
''')
print(len(secs))
