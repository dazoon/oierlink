/**
 * ============================================
 * 信奥导航站 - Cloudflare Worker API
 * 功能：接收用户提交 + 提供审核后数据
 * 部署：用 Wrangler CLI 或 Cloudflare 控制台
 * ============================================
 *
 * 部署步骤：
 * 1. 在 Cloudflare 创建 KV 命名空间：oierlink-kv
 * 2. 用 wrangler deploy 或控制台粘贴代码
 * 3. 在 Worker 设置中绑定 KV（变量名：OIERLINK_KV）
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // ==== GET /api/links?status=approved ====
    if (path === '/api/links' && request.method === 'GET') {
      const status = url.searchParams.get('status') || 'approved';
      const data = await env.OIERLINK_KV.get('links', 'json') || [];
      const filtered = data.filter(item => item.status === status);
      return new Response(JSON.stringify(filtered), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ==== GET /api/news?status=approved ====
    if (path === '/api/news' && request.method === 'GET') {
      const status = url.searchParams.get('status') || 'approved';
      const data = await env.OIERLINK_KV.get('news', 'json') || [];
      const filtered = data.filter(item => item.status === status);
      return new Response(JSON.stringify(filtered), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ==== GET /api/players?status=approved ====
    if (path === '/api/players' && request.method === 'GET') {
      const status = url.searchParams.get('status') || 'approved';
      const data = await env.OIERLINK_KV.get('players', 'json') || [];
      const filtered = data.filter(item => item.status === status);
      return new Response(JSON.stringify(filtered), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ==== POST /api/submit ====
    if (path === '/api/submit' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { type, name, url, desc, category } = body;

        // 基本验证
        if (!type || !name || !url) {
          return new Response(JSON.stringify({ error: '缺少必要字段：type, name, url' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        if (!url.startsWith('http')) {
          return new Response(JSON.stringify({ error: '网址格式不正确' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // 构建提交数据
        const submission = {
          name: name.trim(),
          url: url.trim(),
          desc: (desc || '').trim(),
          category: category || '',
          status: 'pending',
          submittedAt: new Date().toISOString(),
          ip: request.headers.get('cf-connecting-ip') || 'unknown'
        };

        // 根据类型存入不同 KV key
        const storageKey = type === 'player' ? 'players' :
                           type === 'article' || type === 'news' ? 'news' : 'links';

        // 读取现有数据
        const existing = await env.OIERLINK_KV.get(storageKey, 'json') || [];

        // 去重检查
        const duplicate = existing.find(item => item.url === submission.url);
        if (duplicate) {
          return new Response(JSON.stringify({
            message: '该网址已存在',
            status: duplicate.status
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // 添加并保存
        existing.push(submission);
        await env.OIERLINK_KV.put(storageKey, JSON.stringify(existing));

        return new Response(JSON.stringify({
          success: true,
          message: '提交成功！审核通过后将展示在导航站。',
          submission: submission
        }), {
          status: 201,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      } catch (e) {
        return new Response(JSON.stringify({ error: '请求格式错误' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ==== GET /api/submissions (查看所有待审核提交) ====
    if (path === '/api/submissions' && request.method === 'GET') {
      // 简易密码保护（生产环境请改密码）
      const auth = url.searchParams.get('key');
      if (auth !== 'oierlink2026') {
        return new Response(JSON.stringify({ error: '未授权' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const [links, news, players] = await Promise.all([
        env.OIERLINK_KV.get('links', 'json'),
        env.OIERLINK_KV.get('news', 'json'),
        env.OIERLINK_KV.get('players', 'json')
      ]);

      return new Response(JSON.stringify({
        links: links || [],
        news: news || [],
        players: players || [],
        pending: {
          links: (links || []).filter(i => i.status === 'pending').length,
          news: (news || []).filter(i => i.status === 'pending').length,
          players: (players || []).filter(i => i.status === 'pending').length
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ==== 404 ====
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};
