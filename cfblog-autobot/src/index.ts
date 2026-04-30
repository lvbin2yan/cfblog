export interface Env {
  DB: D1Database;
  API_KEY: string;          // 主模型 Key
  BACKUP_API_KEY: string;   // 备用模型 Key
  SERP_API_KEY: string;     // SerpApi Key
  TAVILY_API_KEY: string;   // Tavily Key
  BING_API_KEY: string;
}

// 模型配置列表
const MODELS_CONFIG = [
  {
    name: "StepFun (NVIDIA)",
    endpoint: "https://integrate.api.nvidia.com/v1/chat/completions",
    model: "stepfun-ai/step-3.5-flash",
    keyField: "API_KEY" as keyof Env
  },
  {
    name: "bbl/grok (Backup)",
    endpoint: "https://api.freetheai.xyz/v1/chat/completions",
    model: "bbl/grok-4.1-fast-non-reasoning",
    keyField: "BACKUP_API_KEY" as keyof Env
  }
];

export default {
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

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const MY_DOMAIN = "https://huba.eu.cc";
    const silentLog = async (msg: string) => console.log(`[Cron] ${msg}`);
    const delayMs = Math.floor(Math.random() * 30 * 60 * 1000);
    
    ctx.waitUntil((async () => {
      await silentLog(`[定时启动] 计划延迟 ${Math.floor(delayMs / 60000)} 分钟后开始...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      await this.runHermesCore(env, silentLog, MY_DOMAIN, true);
    })());
  },

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
    await log(`💡 选定方向: 【${selected.kw}】 | 类别: ${selected.cat}`);

    await log("🌐 STEP 2: 正在检索全网素材 (支持多引擎自动切换)...");
    const allIntel = await this.fetch15SourcesWithFallback(selected.kw, env, log);
    
    // 提取并显示将要整合的素材标题
    const rawItems = allIntel.split('\n\n').filter(t => t.trim());
    await log(`🔍 检索完成，共获取 ${rawItems.length} 条原始素材。`);
    const optimizedIntel = rawItems.slice(0, 5).join('\n\n');
    await log(`📋 选定前 5 条核心素材进入整合流程...`);

    await log("🤖 STEP 3: AI 开始人格化深度整合 (1000字级)...");
    await log(`📝 整合逻辑：分析蓝海趋势 -> 模拟真人语气 -> 构建保姆级教程结构`);
    
    try {
      const article = await this.generateArticleWithStability(selected.kw, selected.cat, optimizedIntel, env, log);
      await log(`✨ 内容生成完毕！预览标题: "${article.title}" | 预估字数: ${article.content.length}`);

      await log("💾 STEP 4: 正在同步至 D1 数据库...");
      const slug = `ai-${Date.now()}`;
      const pubDate = new Date().toISOString();
      const finalUrl = `${domain}/post/${slug}`;
      
      await env.DB.prepare(`
        INSERT INTO posts (title, content, excerpt, slug, status, post_type, author_id, comment_status, created_at, updated_at, published_at)
        VALUES (?, ?, ?, ?, 'publish', 'post', 1, 'open', ?, ?, ?)
      `).bind(article.title, article.content, article.excerpt, slug, pubDate, pubDate, pubDate).run();

      await log(`🎉 入库成功！Slug: ${slug}`);

      await log("📡 STEP 5: 正在推送多引擎 SEO 收录信号...");
      await this.submitSEO(finalUrl, domain, env, log);

      await log(`✅ 流程圆满结束！公开访问地址: ${finalUrl}`);
    } catch (e: any) {
      throw new Error(`执行中断: ${e.message}`);
    }
  },

  async fetch15SourcesWithFallback(kw: string, env: Env, log: any): Promise<string> {
    // 1. SerpApi
    if (env.SERP_API_KEY) {
      try {
        await log("🔎 [1/3] 正在通过 SerpApi (Google/Bing) 检索...");
        const res = await this.fetchSerpApi(kw, env, log);
        if (res) {
          await log("✅ SerpApi 检索成功。");
          return res;
        }
      } catch (e: any) {
        await log(`⚠️ SerpApi 暂不可用: ${e.message}`);
      }
    }

    // 2. Tavily
    if (env.TAVILY_API_KEY) {
      try {
        await log("🔎 [2/3] 正在切换至 Tavily 专业搜索引擎...");
        const res = await this.fetchTavily(kw, env, log);
        if (res) {
          await log("✅ Tavily 检索成功。");
          return res;
        }
      } catch (e: any) {
        await log(`⚠️ Tavily 检索异常: ${e.message}`);
      }
    }

    // 3. DuckDuckGo
    try {
      await log("🔎 [3/3] 正在启用 DuckDuckGo 免费源进行最后兜底...");
      const res = await this.fetchDuckDuckGo(kw, log);
      await log("✅ DuckDuckGo 兜底成功。");
      return res;
    } catch (e) {
      await log("❌ 所有搜索源均已失效，进入离线创作模式。");
      return "无法获取实时素材，将基于模型已有知识库进行创作。";
    }
  },

  async fetchSerpApi(kw: string, env: Env, log: any) {
    let combined = "";
    let count = 0;
    const engines = ["google", "bing"];
    for (const engine of engines) {
      const url = `https://serpapi.com/search?q=${encodeURIComponent(kw)}&engine=${engine}&api_key=${env.SERP_API_KEY}`;
      const res = await fetch(url);
      if (res.status === 403) throw new Error("额度耗尽 (403)");
      const data: any = await res.json();
      const results = data.organic_results || [];
      for (const item of results) {
        if (count >= 15) break;
        count++;
        await log(`   - [Serp-${engine}] 找到: ${item.title.substring(0, 30)}...`);
        combined += `【素材${count}】来源: ${item.link} 标题: ${item.title} 摘要: ${item.snippet}\n\n`;
      }
    }
    return combined;
  },

  async fetchTavily(kw: string, env: Env, log: any) {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: env.TAVILY_API_KEY,
        query: kw,
        search_depth: "advanced",
        max_results: 10
      })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: any = await res.json();
    let resultText = "";
    data.results.forEach((r: any, i: number) => {
      log(`   - [Tavily] 找到: ${r.title.substring(0, 30)}...`);
      resultText += `【素材${i+1}】链接: ${r.url} 标题: ${r.title} 摘要: ${r.content}\n\n`;
    });
    return resultText;
  },

  async fetchDuckDuckGo(kw: string, log: any) {
    const res = await fetch(`https://duckduckgo.com/html/?q=${encodeURIComponent(kw)}`);
    const text = await res.text();
    const titles = [...text.matchAll(/result__a">([^<]+)/g)].slice(0, 10);
    const links = [...text.matchAll(/result__url">([^<]+)/g)].slice(0, 10);
    if (titles.length === 0) throw new Error("DDG 无法提取内容");
    
    return titles.map((t, i) => {
      const title = t[1].trim();
      log(`   - [DDG] 找到: ${title.substring(0, 30)}...`);
      return `【素材${i+1}】标题: ${title}`;
    }).join("\n\n");
  },

  async generateArticleWithStability(kw: string, cat: string, intel: string, env: Env, log: any): Promise<any> {
    let lastError = null;
    for (const config of MODELS_CONFIG) {
      try {
        await log(`🤖 正在调用 ${config.name} 进行内容创作...`);
        const apiKey = env[config.keyField] as string;
        if (!apiKey) {
          await log(`   ⚠️ 缺失 ${config.keyField}，跳过该模型。`);
          continue;
        }

        const res = await fetch(config.endpoint, {
          method: "POST",
          headers: { 
            "Authorization": `Bearer ${apiKey.trim()}`, 
            "Content-Type": "application/json" 
          },
          body: JSON.stringify({
            model: config.model,
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
          13、文章一定要以实战经验为主线，原创度必须要在70以上，必须要有个人独到大见解融入到文章中。

          输出格式（仅返回 JSON）:

        。输出 JSON: {"title": "...", "excerpt": "...", "content": "..."} 素材：${intel}`
            }],
            temperature: 0.8
          })
        });

        if (!res.ok) throw new Error(`API 响应错误: ${res.status}`);
        const data: any = await res.json();
        const raw = data.choices?.[0]?.message?.content?.trim() || "";
        const start = raw.indexOf('{');
        const end = raw.lastIndexOf('}');
        if (start !== -1 && end !== -1) {
            await log(`✅ ${config.name} 生成成功。`);
            return JSON.parse(raw.substring(start, end + 1));
        }
        throw new Error("模型未返回标准 JSON 格式");
      } catch (e: any) {
        lastError = e;
        await log(`⚠️ ${config.name} 尝试失败: ${e.message}`);
      }
    }
    throw new Error(`所有可用模型均执行失败。最后一次报错: ${lastError?.message}`);
  },

  async submitSEO(url: string, domain: string, env: Env, log: any) {
    try {
      const gRes = await fetch(`https://www.google.com/ping?sitemap=${encodeURIComponent(url)}`);
      await log(gRes.ok ? "✅ Google Sitemap Ping 成功。" : `❌ Google Ping 失败 (${gRes.status})`);
    } catch (e: any) {
      await log(`❌ Google Ping 异常: ${e.message}`);
    }

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
      await log(bRes.ok ? "✅ Bing IndexNow 推送成功。" : `❌ Bing IndexNow 失败 (${bRes.status})`);
    } catch (e: any) {
      await log(`❌ Bing 推送异常: ${e.message}`);
    }
  }
};