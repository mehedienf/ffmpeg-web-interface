/**
 * lib/analytics.ts
 *
 * Lightweight, zero-dependency visitor tracking system.
 * Saves daily visit counts, unique visitors, and recent visits into data/visitors.json.
 * Designed to be easily connected to a SQL or NoSQL database in the future.
 */

import path from "path";
import fs from "fs";
import crypto from "crypto";
import { NextRequest } from "next/server";

const APP_ROOT = process.env.APP_DIR || process.cwd();
export const DATA_DIR = path.join(APP_ROOT, "data");
export const STATS_FILE = path.join(DATA_DIR, "visitors.json");

export interface DailyStat {
  date: string;            // "YYYY-MM-DD"
  totalVisits: number;     // Total page hits today
  uniqueVisitors: number;  // Distinct unique visitors today
  visitorHashes: string[]; // Anonymized hashes to deduplicate unique visits today
  lastVisit: string;       // ISO timestamp
}

export interface RecentVisit {
  timestamp: string;
  date: string;
  visitorHash: string;
  device: "Desktop" | "Mobile" | "Tablet" | "Unknown";
  browser: string;
  referrer: string;
}

export interface AnalyticsData {
  totalVisits: number;
  totalUniqueVisitors: number;
  firstTrackedAt: string;
  lastVisitAt: string;
  daily: Record<string, DailyStat>;
  recentVisits: RecentVisit[];
}

function ensureDataDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o777 });
    }
  } catch (err) {
    console.warn("[Analytics] Error creating data directory:", err);
  }
}

function getDefaultData(): AnalyticsData {
  const now = new Date().toISOString();
  return {
    totalVisits: 0,
    totalUniqueVisitors: 0,
    firstTrackedAt: now,
    lastVisitAt: now,
    daily: {},
    recentVisits: [],
  };
}

export function loadAnalytics(): AnalyticsData {
  ensureDataDir();
  try {
    if (fs.existsSync(STATS_FILE)) {
      const content = fs.readFileSync(STATS_FILE, "utf-8");
      return JSON.parse(content) as AnalyticsData;
    }
  } catch (err) {
    console.warn("[Analytics] Error loading stats file, creating new:", err);
  }

  const def = getDefaultData();
  saveAnalytics(def);
  return def;
}

export function saveAnalytics(data: AnalyticsData) {
  ensureDataDir();
  try {
    const tmp = `${STATS_FILE}.tmp.${Date.now()}`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
    fs.renameSync(tmp, STATS_FILE);
  } catch (err) {
    console.error("[Analytics] Error saving stats file:", err);
  }
}

// Simple in-memory queue to prevent file write collisions
let writeQueue = Promise.resolve();

function enqueueWrite<T>(fn: () => T | Promise<T>): Promise<T> {
  const res = writeQueue.then(fn);
  writeQueue = res.then(() => {}, () => {});
  return res;
}

function parseDevice(ua: string): "Desktop" | "Mobile" | "Tablet" | "Unknown" {
  if (!ua) return "Unknown";
  if (/ipad|tablet/i.test(ua)) return "Tablet";
  if (/mobile|iphone|android|phone/i.test(ua)) return "Mobile";
  return "Desktop";
}

function parseBrowser(ua: string): string {
  if (!ua) return "Unknown";
  if (/edg/i.test(ua)) return "Edge";
  if (/opr|opera/i.test(ua)) return "Opera";
  if (/chrome|crios/i.test(ua)) return "Chrome";
  if (/firefox|fxios/i.test(ua)) return "Firefox";
  if (/safari/i.test(ua)) return "Safari";
  return "Other";
}

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    "127.0.0.1"
  );
}

/**
 * Tracks a site visit from an incoming request.
 * Increments total visits and today's visits in data/visitors.json.
 */
export async function recordVisit(req: NextRequest, clientReferrer?: string): Promise<{
  todayVisits: number;
  todayUnique: number;
  totalVisits: number;
}> {
  return enqueueWrite(() => {
    const data = loadAnalytics();
    const now = new Date();
    const nowIso = now.toISOString();

    // Date formatted as YYYY-MM-DD in local time
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const dateKey = `${year}-${month}-${day}`;

    const ip = getClientIp(req);
    const ua = req.headers.get("user-agent") || "";
    const referrerHeader = clientReferrer || req.headers.get("referer") || "Direct";

    // Hash IP + UA for privacy (anonymized visitor identifier)
    const visitorHash = crypto
      .createHash("sha256")
      .update(`${ip}_${ua}`)
      .digest("hex")
      .slice(0, 12);

    // Initialize today's record if not present
    if (!data.daily[dateKey]) {
      data.daily[dateKey] = {
        date: dateKey,
        totalVisits: 0,
        uniqueVisitors: 0,
        visitorHashes: [],
        lastVisit: nowIso,
      };
    }

    const todayStat = data.daily[dateKey];
    todayStat.totalVisits += 1;
    todayStat.lastVisit = nowIso;

    // Check if unique visitor for today
    const isUniqueToday = !todayStat.visitorHashes.includes(visitorHash);
    if (isUniqueToday) {
      todayStat.uniqueVisitors += 1;
      todayStat.visitorHashes.push(visitorHash);

      // Keep maximum 5000 hashes per day to prevent file bloat
      if (todayStat.visitorHashes.length > 5000) {
        todayStat.visitorHashes.shift();
      }
    }

    data.totalVisits += 1;
    data.lastVisitAt = nowIso;

    // Add to recent visits (keep last 50)
    data.recentVisits.unshift({
      timestamp: nowIso,
      date: dateKey,
      visitorHash,
      device: parseDevice(ua),
      browser: parseBrowser(ua),
      referrer: referrerHeader.slice(0, 100),
    });

    if (data.recentVisits.length > 50) {
      data.recentVisits = data.recentVisits.slice(0, 50);
    }

    saveAnalytics(data);

    return {
      todayVisits: todayStat.totalVisits,
      todayUnique: todayStat.uniqueVisitors,
      totalVisits: data.totalVisits,
    };
  });
}

/**
 * Returns formatted analytics stats for API or dashboard.
 */
export function getVisitorStats() {
  const data = loadAnalytics();
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const todayKey = `${year}-${month}-${day}`;

  const todayStat = data.daily[todayKey] || {
    date: todayKey,
    totalVisits: 0,
    uniqueVisitors: 0,
    visitorHashes: [],
    lastVisit: "Never",
  };

  // Convert daily record to sorted list (newest first)
  const dailyHistory = Object.values(data.daily)
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((d) => ({
      date: d.date,
      visits: d.totalVisits,
      uniqueVisitors: d.uniqueVisitors,
      lastVisit: d.lastVisit,
    }));

  return {
    today: {
      date: todayKey,
      visits: todayStat.totalVisits,
      uniqueVisitors: todayStat.uniqueVisitors,
      lastVisit: todayStat.lastVisit,
    },
    totalVisits: data.totalVisits,
    firstTrackedAt: data.firstTrackedAt,
    lastVisitAt: data.lastVisitAt,
    dailyHistory,
    recentVisits: data.recentVisits.slice(0, 20),
  };
}

