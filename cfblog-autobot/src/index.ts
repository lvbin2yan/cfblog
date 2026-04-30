export interface Env {
  DB: D1Database;
  API_KEY: string;
  SERP_API_KEY: string;
  BING_API_KEY: string;
}

export default {
  /**
   * 1. 浏览器/HTTP 触发入口 (用于手动调试)
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (url.pathname === "/favicon.ico") return new Response(null, { status: 404 });

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();
    const MY_DOMAIN = "https://huba.eu.cc";

    const writeLog = async (msg: string) => {
      const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
      console.log(`[${time}] ${msg}`);
      try { await writer.write(encoder.encode(`[${time}] ${msg}\n\n`)); } catch (e) {}
    };

    // 重点：使用 ctx.waitUntil 确保异步逻辑不被 Worker 强制中断
    ctx.waitUntil((async () => {
      try {
        await this.runHermesCore(env, writeLog, MY_DOMAIN, false);
      } catch (e: any) {
        await writeLog(`🚨 致命错误: ${e.message}`);
      } finally {
        await writer.close();
      }
    })());

    return new Response(readable, { 
      headers: { 
        "Content-Type": "text/plain; charset=utf-8", 
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      } 
    });
  },

  /**
   * 2. 定时任务触发入口 (加入随机延迟逻辑)
   */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const MY_DOMAIN = "https://huba.eu.cc";
    const silentLog = async (msg: string) => console.log(`[Cron] ${msg}`);
    
    // 随机延迟 0-30 分钟发布
    const delayMs = Math.floor(Math.random() * 30 * 60 * 1000);
    
    ctx.waitUntil((async () => {
      await silentLog(`[定时启动] 计划延迟 ${Math.floor(delayMs / 60000)} 分钟后开始...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      await this.runHermesCore(env, silentLog, MY_DOMAIN, true);
    })());
  },

  /**
   * 3. 核心业务引擎
   */
  async runHermesCore(env: Env, log: (m: string) => Promise<void>, domain: string, isRandom: boolean) {
    await log(`🚀 blog 2.0 任务启动${isRandom ? ' (自动随机模式)' : ' (手动立即模式)'}...`);

    const seedKeywords = [
      {kw: "AI 工具 教程 2026", cat: "工具教程"},
      {kw: "AI 提效 办公 自动化", cat: "效率提升"},
      {kw: "AI 写作 文案 生成", cat: "内容创作"},
      {kw: "本地部署 AI 模型", cat: "技术实战"},
      {kw: "AI Agent 智能体 教程", cat: "前沿技术"}
    ];
    const selected = seedKeywords[Math.floor(Math.random() * seedKeywords.length)];
    await log(`💡 选定方向: 【${selected.kw}】`);

    await log("🌐 STEP 2: 正在检索全网素材 (展示10~15篇分析过程)...");
    const allIntel = await this.fetch15Sources(selected.kw, env, log);
    const optimizedIntel = allIntel.split('\n\n').filter(t => t.trim()).slice(0, 5).join('\n\n');

    await log("🤖 STEP 3: AI 开始人格化深度整合 (1000字级)...");
    
    try {
      const article = await this.generateArticleWithStability(selected.kw, selected.cat, optimizedIntel, env, log);

      await log("💾 STEP 4: 正在同步至 D1 数据库...");
      const slug = `ai-${Date.now()}`;
      const pubDate = new Date().toISOString();
      const finalUrl = `${domain}/post/${slug}`;
      
      await env.DB.prepare(`
        INSERT INTO posts (title, content, excerpt, slug, status, post_type, author_id, comment_status, created_at, updated_at, published_at)
        VALUES (?, ?, ?, ?, 'publish', 'post', 1, 'open', ?, ?, ?)
      `).bind(article.title, article.content, article.excerpt, slug, pubDate, pubDate, pubDate).run();

      await log(`🎉 入库成功！标题: ${article.title}`);

      await log("📡 STEP 5: 正在推送多引擎 SEO 收录信号...");
      await this.submitSEO(finalUrl, domain, env, log);

      await log(`✅ 流程圆满结束！查看地址: ${finalUrl}`);
    } catch (e: any) {
      throw new Error(`执行中断: ${e.message}`);
    }
  },

  async fetch15Sources(kw: string, env: Env, log: any) {
    let combined = "";
    let count = 0;
    const seenLinks = new Set();
    const engines = ["google", "bing"];
    for (const engine of engines) {
      if (count >= 15) break;
      const url = `https://serpapi.com/search?q=${encodeURIComponent(kw)}&engine=${engine}&api_key=${env.SERP_API_KEY}`;
      try {
        const res = await fetch(url);
        const data: any = await res.json();
        const results = data.organic_results || [];
        for (const item of results) {
          if (count >= 15) break;
          if (seenLinks.has(item.link)) continue;
          seenLinks.add(item.link);
          count++;
          await log(`📍 [${engine.toUpperCase()}] 第${count}篇: ${item.title}`);
          combined += `【素材${count}】标题: ${item.title} 摘要: ${item.snippet}\n\n`;
        }
      } catch (e) {
        await log(`⚠️ ${engine} 抓取请求异常。`);
      }
    }
    return combined;
  },

  async submitSEO(url: string, domain: string, env: Env, log: any) {
    try {
      const gRes = await fetch(`https://www.google.com/ping?sitemap=${encodeURIComponent(url)}`);
      await log(gRes.ok ? "✅ Google Ping 成功。" : "❌ Google Ping 失败。");
    } catch (e) {}

    try {
      const bRes = await fetch("https://www.bing.com/indexnow", {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          host: new URL(domain).hostname,
          key: env.BING_API_KEY,
          keyLocation: `${domain}/${env.BING_API_KEY}.txt`,
          urlList: [url]
        })
      });
      if (bRes.ok) await log("✅ Bing IndexNow 推送成功。");
    } catch (e) {}
  },

  async generateArticleWithStability(kw: string, cat: string, intel: string, env: Env, log: any, retry = 0): Promise<any> {
    const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.API_KEY.trim()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "stepfun-ai/step-3.5-flash",
        messages: [{ 
           role: "user", 
          content: `你是一个资深科技博主。任务：根据以下素材写一篇《${kw}》深度保姆级教程。
          
          要求：
          1. 字数务必在 1000 字到 1500 字之间。
          2. 文章必须包含：背景、详细实操步骤（带代码块）、[IMAGE_PLACEHOLDER] 占位符、避坑指南、总结。
          3. 语气要像真人在分享心得，多用“笔者发现”、“强烈建议”等词。
          4. 标题20字左右，要像"真人"写的，带点情绪。
          5. 文章字数一定要在1000字以上，包含具体的步骤说明和代码块。
          6. 适当位置插入 [IMAGE_PLACEHOLDER: ${kw} 相关实操图] 占位。
          7. 结尾要自然，加上标签：#${cat} #${kw}
          8、文章内容要具有实用性和可操作性，避免空洞的理论阐述。
          9、一定要用人类的自然语言来表达，不要任何AI生成的痕迹。
          10、文章结构要清晰，段落分明，便于阅读。
          11、要能和读者产生共鸣，可以适当加入一些个人经历或者观点，但不要过于主观。
          12、要像教小学生一样讲解，步骤要详细，不能有任何跳跃。

          输出格式（仅返回 JSON）:

          输出JSON: {"title": "...", "excerpt": "...", "content": "..."} 素材：${intel}`
        }],
        temperature: 0.8
      })
    });

    if (!res.ok) {
      if (retry < 1) return await this.generateArticleWithStability(kw, cat, intel, env, log, retry + 1);
      throw new Error(`AI 服务暂时不可用`);
    }

    const data: any = await res.json();
    let raw = data.choices?.[0]?.message?.content?.trim() || "";

    try {
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start !== -1 && end !== -1) return JSON.parse(raw.substring(start, end + 1));
      throw new Error();
    } catch (e) {
      return {
        title: `${kw} 深度实战教程 (2026)`,
        excerpt: `关于 ${kw} 的详细整合报告。`,
        content: raw.replace(/```json|```/g, "")
      };
    }
  }
};