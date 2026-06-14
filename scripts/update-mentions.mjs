#!/usr/bin/env node
/* Fisher Hill agenda watcher.
   Scans WPCNA meeting-minutes PDFs for Fisher Hill's name, its boundary
   streets, and adjacent anchors (hospital, Post Road corridor), then updates
   fisher-hill-mentions.json — which index.html renders as the
   "Fisher Hill at recent meetings" section.

   Plain Node 18+ (uses global fetch). One external requirement:
   `pdftotext` (poppler-utils) on PATH. Run from anywhere:
     node scripts/update-mentions.mjs
*/

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

const SOURCE_PAGES = [
  "https://wp-cna.org/agendas",
  "https://wp-cna.org/archived-agendas"
];

const OUT_PATH = fileURLToPath(new URL("../fisher-hill-mentions.json", import.meta.url));

// [display name, matcher] — matched case-insensitively against PDF text.
const TERMS = [
  ["Fisher Hill",            /fisher\s+hill/i],
  ["Fisher Ave",             /fisher\s+av/i],
  ["Post Road",              /\bpost\s+(road|rd)\b/i],
  ["Walworth Ave",           /\bwalworth\b/i],
  ["Westmoreland Ave",       /\bwestmoreland\b/i],
  ["Tibbits Ave",            /\btibbits\b/i],
  ["Rochambeau Ave",         /\brochambeau\b/i],
  ["Colden Ave",             /\bcolden\b/i],
  ["Merritt Ave",            /\bmerritt\b/i],
  ["Stevens St",             /\bstevens\s+st/i],
  ["Walton Ave",             /\bwalton\s+av/i],
  ["Bogert Ave",             /\bbogert\b/i],
  ["Greenacres Ave",         /\bgreenacres\b/i],
  ["Irving Pl",              /\birving\s+pl/i],
  ["Bank St",                /\bbank\s+st/i],
  ["S Lexington Ave",        /\b(s\.?|south)\s+lexington\b/i],
  ["Bronx River Pkwy",       /\bbronx\s+river\b/i],
  ["Mattison Park",          /\bmattison\b/i],
  ["White Plains Hospital",  /white\s+plains\s+hospital/i],
  ["Longview Ave",           /\blongview\b/i],
  ["Maple Ave",              /\bmaple\s+av/i]
];

const MONTHS = ["January","February","March","April","May","June",
  "July","August","September","October","November","December"];

async function main() {
  const data = await loadExisting();
  const known = new Set(data.scanned || []);

  // 1. Collect every minutes/agenda PDF link from the WPCNA site.
  const urls = new Set();
  for (const page of SOURCE_PAGES) {
    try {
      const html = await (await fetch(page, { redirect: "follow" })).text();
      for (const m of html.matchAll(/href="([^"]+\.pdf[^"]*)"/gi)) {
        try { urls.add(new URL(m[1], page).href); } catch { /* skip bad href */ }
      }
    } catch (e) {
      console.error(`Could not fetch ${page}: ${e.message}`);
    }
  }

  // 2. Scan only PDFs we haven't seen before.
  const fresh = [...urls].filter(u => !known.has(u));
  console.log(`${urls.size} PDFs listed, ${fresh.length} new.`);

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "fh-"));
  let added = 0;

  for (const url of fresh) {
    try {
      const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
      const file = path.join(tmp, "doc.pdf");
      await fs.writeFile(file, buf);
      const { stdout: text } = await run("pdftotext", [file, "-"], { maxBuffer: 64 * 1024 * 1024 });

      const matched = TERMS.filter(([, re]) => re.test(text)).map(([name]) => name);
      data.scanned.push(url);

      if (matched.length) {
        const date = dateFromName(url) || dateFromText(text);
        data.mentions.push({
          date: date || "",
          label: date ? prettyDate(date) : decodeURIComponent(url.split("/").pop()),
          meeting: "CNA meeting minutes",
          summary: excerptAround(text, TERMS),
          terms: matched,
          pdf: url,
          auto: true
        });
        added++;
        console.log(`MATCH  ${url}\n       [${matched.join(", ")}]`);
      } else {
        console.log(`clean  ${url}`);
      }
    } catch (e) {
      console.error(`Failed on ${url}: ${e.message}`); // leave un-scanned; retried next run
    }
  }

  // 3. Sort newest first (undated entries sink) and write.
  data.mentions.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  data.updated = new Date().toISOString().slice(0, 10);
  await fs.writeFile(OUT_PATH, JSON.stringify(data, null, 2) + "\n");
  console.log(`Done. ${added} new mention(s); ${data.mentions.length} total.`);
}

async function loadExisting() {
  try {
    const d = JSON.parse(await fs.readFile(OUT_PATH, "utf8"));
    d.scanned ||= []; d.mentions ||= [];
    return d;
  } catch {
    return {
      updated: "",
      source: "WPCNA (Council of Neighborhood Associations) meeting minutes — wp-cna.org/agendas",
      scanned: [],
      mentions: []
    };
  }
}

/* Dates from filenames like "03-10-26", "1-13-26", "12-9-25", "091024",
   or "February 2026". */
function dateFromName(url) {
  const name = decodeURIComponent(url.split("/").pop() || "");
  let m = name.match(/(\d{1,2})[-_.](\d{1,2})[-_.](\d{2,4})/);
  if (m) return iso(m[3], m[1], m[2]);
  m = name.match(/(?:^|\D)(\d{2})(\d{2})(\d{2})(?:\D|$)/);
  if (m) return iso(m[3], m[1], m[2]);
  m = name.match(new RegExp(`(${MONTHS.join("|")})\\s+(\\d{1,2}),?\\s+(\\d{4})`, "i"));
  if (m) return iso(m[3], MONTHS.findIndex(x => x.toLowerCase() === m[1].toLowerCase()) + 1, m[2]);
  m = name.match(new RegExp(`(${MONTHS.join("|")})\\s*,?\\s*(\\d{4})`, "i"));
  if (m) return iso(m[2], MONTHS.findIndex(x => x.toLowerCase() === m[1].toLowerCase()) + 1, 1);
  return null;
}

function dateFromText(text) {
  const head = text.slice(0, 600);
  let m = head.match(new RegExp(`(${MONTHS.join("|")})\\s+(\\d{1,2}),?\\s+(\\d{4})`, "i"));
  if (m) return iso(m[3], MONTHS.findIndex(x => x.toLowerCase() === m[1].toLowerCase()) + 1, m[2]);
  m = head.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) return iso(m[3], m[1], m[2]);
  return null;
}

function iso(y, mo, d) {
  y = Number(y); mo = Number(mo); d = Number(d);
  if (y < 100) y += 2000;
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function prettyDate(isoDate) {
  const [y, mo, d] = isoDate.split("-").map(Number);
  return `${MONTHS[mo - 1]} ${d}, ${y}`;
}

/* Pull a readable snippet around the earliest term match. */
function excerptAround(text, terms) {
  const clean = text.replace(/\s+/g, " ").trim();
  let first = -1;
  for (const [, re] of terms) {
    const m = clean.match(re);
    if (m && (first === -1 || m.index < first)) first = m.index;
  }
  if (first === -1) return "";
  let start = Math.max(0, first - 120);
  let end = Math.min(clean.length, first + 280);
  while (start > 0 && !/\s/.test(clean[start])) start--;
  while (end < clean.length && !/\s/.test(clean[end])) end++;
  return (start > 0 ? "…" : "") + clean.slice(start, end).trim() + (end < clean.length ? "…" : "");
}

main().catch(e => { console.error(e); process.exit(1); });
