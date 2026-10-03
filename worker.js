/**
 * Scaccelerator - Cloudflare Worker CORS & API Proxy
 * 部署到 Cloudflare Workers 可作为个人高速独立代理，100% 解决跨域与防盗链问题。
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 处理 OPTIONS 预检请求
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
          "Access-Control-Allow-Headers": "*",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    // 获取目标 URL: 通过 ?url= 参数或者直接转发
    const targetUrl = url.searchParams.get("url");
    if (!targetUrl) {
      return new Response(
        JSON.stringify({
          error: "Missing target url parameter (?url=https://...)",
          usage: "https://your-worker.workers.dev/?url=https://community-api.xiaomawang.com/japi/v1/composition/get-encrypt-sb3?compositionEncryptId=8EKQ666J",
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    try {
      // 构造请求，伪装小码王官方 Referer 和常见请求头以穿透防盗链
      const modifiedHeaders = new Headers(request.headers);
      modifiedHeaders.set("Referer", "https://world.xiaomawang.com/");
      modifiedHeaders.set("Origin", "https://world.xiaomawang.com");
      modifiedHeaders.set(
        "User-Agent",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      );

      const response = await fetch(targetUrl, {
        method: request.method,
        headers: modifiedHeaders,
        redirect: "follow",
      });

      // 附加 CORS 响应头
      const responseHeaders = new Headers(response.headers);
      responseHeaders.set("Access-Control-Allow-Origin": "*",);
      responseHeaders.set("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS");
      responseHeaders.set("Access-Control-Allow-Headers", "*");
      responseHeaders.set("Access-Control-Expose-Headers", "*");

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: err.message || "Failed to fetch target URL" }),
        {
          status: 502,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }
  },
};
