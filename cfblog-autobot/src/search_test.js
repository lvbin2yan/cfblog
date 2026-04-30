/**
 * 模拟本地环境变量
 */
const env = {
    SERP_API_KEY: "5289cb06b6136d09e8c3cabf1453386602d19689a079271c049cc52b7b50e3127",     // 填入后测试，或置为空测试切换
    TAVILY_API_KEY: "TEXT-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",   // 填入刚才申请的 Key
};

/**
 * 模拟日志函数
 */
const log = async (m) => {
    const time = new Date().toLocaleTimeString();
    console.log(`[\x1b[36m${time}\x1b[0m] ${m}`);
};

/**
 * 核心测试引擎
 */
const SearchTester = {
    // 1. 模拟 SerpApi 逻辑
    async fetchSerpApi(kw) {
        if (!env.SERP_API_KEY || env.SERP_API_KEY.includes("你的")) {
            throw new Error("SerpApi Key 未配置");
        }
        
        let combined = "";
        let count = 0;
        const engines = ["google", "bing"];
        
        for (const engine of engines) {
            const url = `https://serpapi.com/search?q=${encodeURIComponent(kw)}&engine=${engine}&api_key=${env.SERP_API_KEY}`;
            const res = await fetch(url);
            
            if (res.status === 403) throw new Error("SerpApi 额度耗尽 (403)");
            if (!res.ok) throw new Error(`SerpApi 响应异常: ${res.status}`);
            
            const data = await res.json();
            const results = data.organic_results || [];
            for (const item of results) {
                if (count >= 5) break; // 测试仅取5篇
                count++;
                combined += `【Serp-${engine}-${count}】${item.title}\n`;
            }
        }
        return combined;
    },

    // 2. 模拟 Tavily 逻辑
    async fetchTavily(kw) {
        if (!env.TAVILY_API_KEY || env.TAVILY_API_KEY.includes("你的")) {
            throw new Error("Tavily Key 未配置");
        }

        const res = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                api_key: env.TAVILY_API_KEY,
                query: kw,
                search_depth: "advanced",
                max_results: 5
            })
        });

        if (!res.ok) throw new Error(`Tavily 响应异常: ${res.status}`);
        const data = await res.json();
        return data.results.map((r, i) => `【Tavily-${i+1}】${r.title}`).join("\n");
    },

    // 3. 模拟 DuckDuckGo 逻辑 (兜底)
    async fetchDuckDuckGo(kw) {
        const res = await fetch(`https://duckduckgo.com/html/?q=${encodeURIComponent(kw)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const text = await res.text();
        const titles = [...text.matchAll(/result__a">([^<]+)/g)].slice(0, 5);
        
        if (titles.length === 0) throw new Error("DDG 无法提取内容");
        return titles.map((t, i) => `【DDG-${i+1}】${t[1].trim()}`).join("\n");
    },

    /**
     * 自动切换逻辑测试
     */
    async runTest(kw) {
        await log(`开始测试关键词: [${kw}]`);
        let finalResults = "";

        // 尝试 SerpApi
        try {
            await log("尝试使用 SerpApi...");
            finalResults = await this.fetchSerpApi(kw);
            await log("\x1b[32m✅ SerpApi 获取成功\x1b[0m");
        } catch (e) {
            await log(`\x1b[33m⚠️ SerpApi 跳过: ${e.message}\x1b[0m`);
            
            // 尝试 Tavily
            try {
                await log("尝试使用 Tavily...");
                finalResults = await this.fetchTavily(kw);
                await log("\x1b[32m✅ Tavily 获取成功\x1b[0m");
            } catch (e2) {
                await log(`\x1b[33m⚠️ Tavily 跳过: ${e2.message}\x1b[0m`);
                
                // 尝试 DuckDuckGo
                try {
                    await log("尝试使用 DuckDuckGo 兜底...");
                    finalResults = await this.fetchDuckDuckGo(kw);
                    await log("\x1b[32m✅ DuckDuckGo 获取成功\x1b[0m");
                } catch (e3) {
                    await log(`\x1b[31m❌ 所有搜索源均已失效: ${e3.message}\x1b[0m`);
                }
            }
        }

        console.log("\n--- 最终抓取到的标题预览 ---");
        console.log(finalResults || "空内容");
        console.log("----------------------------\n");
    }
};

// 执行测试
SearchTester.runTest("2026年AI Agent发展趋势");