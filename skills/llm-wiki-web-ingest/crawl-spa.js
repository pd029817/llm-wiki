#!/usr/bin/env node
/**
 * SPA 크롤러 - Playwright 기반
 *
 * 사용법:
 *   node crawl-spa.js <base-url> [--sub-paths path1,path2,...] [--output dir] [--wait ms] [--depth N]
 *
 * 예시:
 *   node crawl-spa.js "https://www.tallcare.co.kr/#/customer" --output ./crawled
 *   node crawl-spa.js "https://example.com/#/docs" --sub-paths "guide,api,faq" --depth 2
 *
 * 출력: 각 페이지를 개별 JSON 파일로 저장 (title, url, content, links, timestamp)
 */

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const args = { subPaths: [], output: "./crawled", wait: 3000, depth: 1 };
  args.baseUrl = argv[2];

  for (let i = 3; i < argv.length; i++) {
    switch (argv[i]) {
      case "--sub-paths":
        args.subPaths = argv[++i].split(",").map((s) => s.trim());
        break;
      case "--output":
        args.output = argv[++i];
        break;
      case "--wait":
        args.wait = parseInt(argv[++i]);
        break;
      case "--depth":
        args.depth = parseInt(argv[++i]);
        break;
    }
  }
  return args;
}

function slugify(url) {
  return url
    .replace(/https?:\/\//, "")
    .replace(/[^a-zA-Z0-9가-힣-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .substring(0, 120);
}

async function crawlPage(page, url, waitMs) {
  console.log(`  크롤링: ${url}`);
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 15000 });
  } catch {
    // networkidle 타임아웃 시 domcontentloaded로 대체
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 10000 });
    } catch (e) {
      console.error(`  실패: ${url} - ${e.message}`);
      return null;
    }
  }

  // SPA 렌더링 대기
  await page.waitForTimeout(waitMs);

  const result = await page.evaluate(() => {
    // IE 호환성 안내 페이지 감지
    const bodyText = document.body.innerText || "";
    if (bodyText.includes("Internet Explorer") && bodyText.includes("지원하지 않습니다")) {
      return { isBlockPage: true };
    }

    // 페이지 제목
    const title =
      document.querySelector("h1")?.innerText ||
      document.querySelector("title")?.innerText ||
      document.title ||
      "";

    // 메인 콘텐츠 추출 (우선순위: main > article > #app > body)
    const contentEl =
      document.querySelector("main") ||
      document.querySelector("article") ||
      document.querySelector('[role="main"]') ||
      document.querySelector("#app") ||
      document.querySelector("#root") ||
      document.body;

    // nav, header, footer, script 등 제거한 텍스트
    const clone = contentEl.cloneNode(true);
    clone.querySelectorAll("nav, header, footer, script, style, noscript, iframe").forEach((el) => el.remove());

    const content = clone.innerText.trim();

    // 모든 내부 링크 수집
    const links = [];
    document.querySelectorAll("a[href]").forEach((a) => {
      const href = a.getAttribute("href");
      if (href && !href.startsWith("http") && !href.startsWith("mailto:") && !href.startsWith("tel:")) {
        links.push({ href, text: a.innerText.trim() });
      }
    });

    // hash 기반 라우팅 링크도 수집
    document.querySelectorAll('[href*="#/"]').forEach((a) => {
      const href = a.getAttribute("href");
      if (href && !links.some((l) => l.href === href)) {
        links.push({ href, text: a.innerText.trim() });
      }
    });

    // 구조화된 데이터 추출 (테이블, 리스트 등)
    const tables = [];
    document.querySelectorAll("table").forEach((table) => {
      const headers = Array.from(table.querySelectorAll("th")).map((th) => th.innerText.trim());
      const rows = [];
      table.querySelectorAll("tbody tr, tr").forEach((tr) => {
        const cells = Array.from(tr.querySelectorAll("td")).map((td) => td.innerText.trim());
        if (cells.length > 0) rows.push(cells);
      });
      if (headers.length > 0 || rows.length > 0) tables.push({ headers, rows });
    });

    return {
      isBlockPage: false,
      title,
      content,
      links,
      tables,
      meta: {
        description: document.querySelector('meta[name="description"]')?.content || "",
        ogTitle: document.querySelector('meta[property="og:title"]')?.content || "",
      },
    };
  });

  if (!result || result.isBlockPage) {
    console.log(`  건너뜀 (IE 호환성 안내 페이지): ${url}`);
    return null;
  }

  return {
    url,
    title: result.title,
    content: result.content,
    links: result.links,
    tables: result.tables,
    meta: result.meta,
    crawled_at: new Date().toISOString(),
  };
}

async function discoverLinks(page, baseUrl, waitMs) {
  console.log("하위 페이지 자동 탐색 중...");
  try {
    await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 15000 });
  } catch {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 10000 });
  }
  await page.waitForTimeout(waitMs);

  const discovered = await page.evaluate((base) => {
    const links = new Set();
    document.querySelectorAll("a[href]").forEach((a) => {
      const href = a.getAttribute("href") || "";
      // hash 기반 라우팅 링크
      if (href.includes("#/")) {
        links.add(href);
      }
      // 상대 경로
      if (href.startsWith("/") && !href.startsWith("//")) {
        links.add(href);
      }
    });

    // 클릭 가능한 요소에서 라우팅 이벤트 탐지
    const clickAttrs = ["onclick", "ng-click", "v-on:click"];
    for (const attr of clickAttrs) {
      try {
        document.querySelectorAll(`[${attr}]`).forEach((el) => {
          const val = el.getAttribute(attr) || "";
          const routeMatch = val.match(/['"]([#/][^'"]+)['"]/);
          if (routeMatch) links.add(routeMatch[1]);
        });
      } catch { /* 지원하지 않는 셀렉터 무시 */ }
    }

    return Array.from(links);
  }, baseUrl);

  console.log(`  발견된 링크: ${discovered.length}개`);
  return discovered;
}

async function main() {
  const args = parseArgs(process.argv);

  if (!args.baseUrl) {
    console.error("사용법: node crawl-spa.js <base-url> [--sub-paths p1,p2] [--output dir] [--wait ms] [--depth N]");
    process.exit(1);
  }

  // 출력 디렉토리 생성
  fs.mkdirSync(args.output, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  const results = [];
  const visited = new Set();
  const toVisit = [args.baseUrl];

  // 명시적 하위 경로 추가
  const baseOrigin = new URL(args.baseUrl.replace(/#.*/, "")).origin;
  const hashBase = args.baseUrl.match(/#(\/[^?]*)/)?.[1] || "";

  for (const sub of args.subPaths) {
    const subUrl = `${baseOrigin}/#${hashBase}/${sub}`.replace(/\/\//g, "/").replace(":#", "#");
    toVisit.push(subUrl);
  }

  // 자동 하위 페이지 탐색
  if (args.depth > 0) {
    const discovered = await discoverLinks(page, args.baseUrl, args.wait);
    for (const link of discovered) {
      let fullUrl;
      if (link.startsWith("http")) {
        fullUrl = link;
      } else if (link.startsWith("#/")) {
        fullUrl = `${baseOrigin}/${link}`;
      } else {
        fullUrl = `${baseOrigin}${link}`;
      }
      if (!toVisit.includes(fullUrl)) {
        toVisit.push(fullUrl);
      }
    }
  }

  console.log(`\n크롤링 대상: ${toVisit.length}개 페이지\n`);

  // 크롤링 실행
  for (const url of toVisit) {
    if (visited.has(url)) continue;
    visited.add(url);

    const result = await crawlPage(page, url, args.wait);
    if (result && result.content.length > 10) {
      results.push(result);

      // 개별 JSON 파일 저장
      const filename = `${slugify(url)}.json`;
      fs.writeFileSync(
        path.join(args.output, filename),
        JSON.stringify(result, null, 2),
        "utf-8"
      );
      console.log(`  저장: ${filename} (${result.content.length}자)\n`);

      // depth > 1이면 발견된 링크도 큐에 추가
      if (args.depth > 1 && result.links) {
        for (const link of result.links) {
          let fullUrl;
          if (link.href.startsWith("http")) {
            fullUrl = link.href;
          } else if (link.href.startsWith("#/")) {
            fullUrl = `${baseOrigin}/${link.href}`;
          } else {
            fullUrl = `${baseOrigin}${link.href}`;
          }
          if (!visited.has(fullUrl) && !toVisit.includes(fullUrl)) {
            toVisit.push(fullUrl);
          }
        }
      }
    }
  }

  // 전체 결과를 하나의 요약 파일로 저장
  const summary = {
    base_url: args.baseUrl,
    crawled_at: new Date().toISOString(),
    total_pages: results.length,
    pages: results.map((r) => ({
      url: r.url,
      title: r.title,
      content_length: r.content.length,
      link_count: r.links.length,
    })),
  };

  fs.writeFileSync(
    path.join(args.output, "_summary.json"),
    JSON.stringify(summary, null, 2),
    "utf-8"
  );

  console.log(`\n완료: ${results.length}개 페이지 크롤링 → ${args.output}/`);
  console.log(`요약: ${args.output}/_summary.json`);

  await browser.close();
}

main().catch((e) => {
  console.error("크롤링 오류:", e);
  process.exit(1);
});
