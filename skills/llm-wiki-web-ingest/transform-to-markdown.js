#!/usr/bin/env node
/**
 * 크롤링된 JSON을 위키용 마크다운으로 변환
 *
 * 사용법:
 *   node transform-to-markdown.js <crawled-dir> [--output dir] [--min-length N]
 *
 * 예시:
 *   node transform-to-markdown.js ./crawled --output ./raw-sources --min-length 100
 */

const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const args = { input: argv[2], output: "./raw-sources", minLength: 100 };
  for (let i = 3; i < argv.length; i++) {
    if (argv[i] === "--output") args.output = argv[++i];
    if (argv[i] === "--min-length") args.minLength = parseInt(argv[++i]);
  }
  return args;
}

function tableToMarkdown(table) {
  if (!table.headers.length && !table.rows.length) return "";

  const headers = table.headers.length > 0 ? table.headers : table.rows[0]?.map((_, i) => `열${i + 1}`) || [];
  const dataRows = table.headers.length > 0 ? table.rows : table.rows.slice(1);

  let md = `| ${headers.join(" | ")} |\n`;
  md += `| ${headers.map(() => "---").join(" | ")} |\n`;
  for (const row of dataRows) {
    // 열 수 맞추기
    const paddedRow = [...row];
    while (paddedRow.length < headers.length) paddedRow.push("");
    md += `| ${paddedRow.slice(0, headers.length).join(" | ")} |\n`;
  }
  return md;
}

function contentToMarkdown(data) {
  let md = `# ${data.title}\n\n`;
  md += `> 출처: [${data.url}](${data.url})  \n`;
  md += `> 크롤링 일시: ${data.crawled_at}\n\n`;

  // 본문
  if (data.content) {
    // 간단한 정리: 연속 빈 줄 제거, 앞뒤 공백 정리
    const cleaned = data.content
      .split("\n")
      .map((line) => line.trim())
      .filter((line, i, arr) => !(line === "" && arr[i - 1] === ""))
      .join("\n");
    md += `## 내용\n\n${cleaned}\n\n`;
  }

  // 테이블
  if (data.tables && data.tables.length > 0) {
    md += `## 데이터 테이블\n\n`;
    for (const table of data.tables) {
      md += tableToMarkdown(table) + "\n";
    }
  }

  // 관련 링크
  if (data.links && data.links.length > 0) {
    const meaningfulLinks = data.links.filter((l) => l.text && l.text.length > 1);
    if (meaningfulLinks.length > 0) {
      md += `## 관련 링크\n\n`;
      for (const link of meaningfulLinks) {
        md += `- [${link.text}](${link.href})\n`;
      }
      md += "\n";
    }
  }

  return md;
}

function main() {
  const args = parseArgs(process.argv);

  if (!args.input) {
    console.error("사용법: node transform-to-markdown.js <crawled-dir> [--output dir] [--min-length N]");
    process.exit(1);
  }

  fs.mkdirSync(args.output, { recursive: true });

  const files = fs.readdirSync(args.input).filter((f) => f.endsWith(".json") && f !== "_summary.json");

  let converted = 0;
  let skipped = 0;
  const index = [];

  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(args.input, file), "utf-8"));

    // 최소 콘텐츠 길이 체크
    if (!data.content || data.content.length < args.minLength) {
      skipped++;
      continue;
    }

    const md = contentToMarkdown(data);
    const mdFilename = file.replace(".json", ".md");
    fs.writeFileSync(path.join(args.output, mdFilename), md, "utf-8");

    index.push({
      file: mdFilename,
      title: data.title,
      url: data.url,
      content_length: data.content.length,
    });
    converted++;
  }

  // 인덱스 파일 생성
  let indexMd = `# 크롤링 소스 인덱스\n\n`;
  indexMd += `변환 일시: ${new Date().toISOString()}\n`;
  indexMd += `총 ${converted}개 문서 변환 (${skipped}개 건너뜀)\n\n`;
  indexMd += `| 파일 | 제목 | 출처 | 크기 |\n`;
  indexMd += `| --- | --- | --- | --- |\n`;
  for (const entry of index.sort((a, b) => b.content_length - a.content_length)) {
    indexMd += `| [${entry.file}](${entry.file}) | ${entry.title} | [링크](${entry.url}) | ${entry.content_length}자 |\n`;
  }

  fs.writeFileSync(path.join(args.output, "_index.md"), indexMd, "utf-8");

  console.log(`\n변환 완료:`);
  console.log(`  변환: ${converted}개 문서`);
  console.log(`  건너뜀: ${skipped}개 (콘텐츠 ${args.minLength}자 미만)`);
  console.log(`  출력: ${args.output}/`);
  console.log(`  인덱스: ${args.output}/_index.md`);
}

main();
