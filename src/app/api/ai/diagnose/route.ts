import { NextResponse } from "next/server";
import * as dns from "dns";
import { promisify } from "util";

export const runtime = "nodejs";

const dnsLookup = promisify(dns.lookup);

const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * Network diagnostic endpoint.
 * Tests connectivity to REAL search engines (NO Wikipedia).
 * GET /api/ai/diagnose
 */
export async function GET() {
  const results: Array<{
    test: string;
    status: "ok" | "fail" | "slow";
    detail: string;
    durationMs: number;
  }> = [];

  // Test 1: DNS resolution for Bing
  try {
    const start = Date.now();
    await dnsLookup("www.bing.com");
    const duration = Date.now() - start;
    results.push({ test: "DNS: www.bing.com", status: duration < 1000 ? "ok" : "slow", detail: `Resolved in ${duration}ms`, durationMs: duration });
  } catch (e) {
    results.push({ test: "DNS: www.bing.com", status: "fail", detail: `DNS failed: ${e instanceof Error ? e.message : "unknown"}`, durationMs: 0 });
  }

  // Test 2: DNS for Google
  try {
    const start = Date.now();
    await dnsLookup("www.google.com");
    const duration = Date.now() - start;
    results.push({ test: "DNS: www.google.com", status: duration < 1000 ? "ok" : "slow", detail: `Resolved in ${duration}ms`, durationMs: duration });
  } catch (e) {
    results.push({ test: "DNS: www.google.com", status: "fail", detail: `DNS failed: ${e instanceof Error ? e.message : "unknown"}`, durationMs: 0 });
  }

  // Test 3: DNS for DuckDuckGo
  try {
    const start = Date.now();
    await dnsLookup("lite.duckduckgo.com");
    const duration = Date.now() - start;
    results.push({ test: "DNS: lite.duckduckgo.com", status: duration < 1000 ? "ok" : "slow", detail: `Resolved in ${duration}ms`, durationMs: duration });
  } catch (e) {
    results.push({ test: "DNS: lite.duckduckgo.com", status: "fail", detail: `DNS failed: ${e instanceof Error ? e.message : "unknown"}`, durationMs: 0 });
  }

  // Test 4: Bing search (actual HTTP request)
  try {
    const start = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch("https://www.bing.com/search?q=test&count=1", {
      headers: { "User-Agent": BROWSER_UA, "Accept": "text/html" },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const duration = Date.now() - start;
    const html = await res.text();
    const hasResults = html.includes("b_algo") || html.length > 10000;
    results.push({
      test: "Bing Search",
      status: res.ok ? (duration < 5000 ? "ok" : "slow") : "fail",
      detail: `HTTP ${res.status} in ${duration}ms — ${html.length} bytes ${hasResults ? "(results found)" : "(no results)"}`,
      durationMs: duration,
    });
  } catch (e) {
    results.push({ test: "Bing Search", status: "fail", detail: `Failed: ${e instanceof Error ? e.message : "unknown"}`, durationMs: 0 });
  }

  // Test 5: Google search
  try {
    const start = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch("https://www.google.com/search?q=test&num=1", {
      headers: { "User-Agent": BROWSER_UA, "Accept": "text/html" },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const duration = Date.now() - start;
    const html = await res.text();
    results.push({
      test: "Google Search",
      status: res.ok ? (duration < 5000 ? "ok" : "slow") : "fail",
      detail: `HTTP ${res.status} in ${duration}ms — ${html.length} bytes`,
      durationMs: duration,
    });
  } catch (e) {
    results.push({ test: "Google Search", status: "fail", detail: `Failed: ${e instanceof Error ? e.message : "unknown"}`, durationMs: 0 });
  }

  // Test 6: DuckDuckGo search
  try {
    const start = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const body = new URLSearchParams({ q: "test", kl: "" });
    const res = await fetch("https://lite.duckduckgo.com/lite/", {
      method: "POST",
      headers: { "User-Agent": BROWSER_UA, "Content-Type": "application/x-www-form-urlencoded", "Accept": "text/html" },
      body: body.toString(),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const duration = Date.now() - start;
    const html = await res.text();
    const hasCaptcha = html.toLowerCase().includes("anomaly");
    results.push({
      test: "DuckDuckGo Search",
      status: res.ok && !hasCaptcha ? (duration < 5000 ? "ok" : "slow") : "fail",
      detail: `HTTP ${res.status} in ${duration}ms — ${html.length} bytes ${hasCaptcha ? "(CAPTCHA blocked)" : ""}`,
      durationMs: duration,
    });
  } catch (e) {
    results.push({ test: "DuckDuckGo Search", status: "fail", detail: `Failed: ${e instanceof Error ? e.message : "unknown"}`, durationMs: 0 });
  }

  // Test 7: General internet
  try {
    const start = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch("https://example.com", { signal: controller.signal });
    clearTimeout(timeout);
    const duration = Date.now() - start;
    results.push({
      test: "General Internet",
      status: res.ok ? (duration < 3000 ? "ok" : "slow") : "fail",
      detail: `HTTP ${res.status} in ${duration}ms`,
      durationMs: duration,
    });
  } catch (e) {
    results.push({ test: "General Internet", status: "fail", detail: `Failed: ${e instanceof Error ? e.message : "unknown"}`, durationMs: 0 });
  }

  // Summary
  const okCount = results.filter((r) => r.status === "ok").length;
  const failCount = results.filter((r) => r.status === "fail").length;
  const slowCount = results.filter((r) => r.status === "slow").length;

  let diagnosis = "";
  if (failCount === results.length) {
    diagnosis = "All tests failed. Your computer cannot reach the internet from Node.js. Check your firewall, antivirus, or network connection.";
  } else if (failCount > 0) {
    diagnosis = `${failCount} of ${results.length} tests failed. Some search engines may be blocked. Mr Robot will try all available engines.`;
  } else if (slowCount > 0) {
    diagnosis = `${slowCount} tests are slow. Search may work but be slower than usual.`;
  } else {
    diagnosis = "All tests passed! Web search should work. Mr Robot will search Bing, Google, and DuckDuckGo for real results.";
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    results,
    summary: { total: results.length, ok: okCount, fail: failCount, slow: slowCount },
    diagnosis,
  });
}
