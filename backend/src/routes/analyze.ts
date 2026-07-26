import { Hono } from 'hono';
import { z } from 'zod';
import { handleError } from '../middleware/error';

type AiBindings = {
  DB: D1Database;
  AI: Ai;
};

const router = new Hono<{ Bindings: AiBindings }>();

const AnalyzeSchema = z.object({
  text: z.string().min(1, 'กรุณากรอกข้อความ').max(5000, 'ข้อความต้องไม่เกิน 5000 ตัวอักษร'),
});

// Expanded incident types covering more scenarios
const INCIDENT_TYPES = [
  'อุบัติเหตุ',
  'ทะเลาะวิวาท',
  'ทรัพย์สินเสียหาย',
  'เจ็บป่วย',
  'บุกรุก',
  'อัคคีภัย',
  'ภัยธรรมชาติ',
  'ไฟฟ้าขัดข้อง',
  'เหตุร้ายแรงอื่นๆ',
] as const;

// ── Thai time expression normalization ──
// Convert Thai words like "ห้าโมงเย็น", "สองทุ่ม", "ตีสาม" to HH:MM format

// Helper: build regex for each Thai number word
const THAI_NUM = {
  'หนึ่ง': 1, 'สอง': 2, 'สาม': 3, 'สี่': 4, 'ห้า': 5,
  'หก': 6, 'เจ็ด': 7, 'แปด': 8, 'เก้า': 9, 'สิบ': 10,
  'สิบเอ็ด': 11, 'สิบสอง': 12,
} as Record<string, number>;

const THAI_NUM_PATTERN = Object.keys(THAI_NUM).join('|');

function normalizeTimeExpressions(text: string): string {
  let result = text;

  // 1. Exact time HH:MM or HH:MM น. — keep as-is (already normalized)
  //    nothing to do here, but skip over these to avoid double-processing

  // 2. ตีหนึ่ง ตีสอง ตีสาม ตีสี่ ตีห้า  → 01:00, 02:00...
  result = result.replace(
    new RegExp(`ตี\\s*(${THAI_NUM_PATTERN})`, 'g'),
    (_m, num: string) => `${(THAI_NUM[num] ?? 0).toString().padStart(2, '0')}:00`
  );

  // 3. สองทุ่ม → 20:00, หนึ่งทุ่ม → 19:00, สามทุ่ม → 21:00, สี่ทุ่ม → 22:00
  result = result.replace(
    new RegExp(`(${THAI_NUM_PATTERN})\\s*ทุ่ม`, 'g'),
    (_m, num: string) => {
      const base = THAI_NUM[num] ?? 0;
      return `${(base + 18).toString().padStart(2, '0')}:00`;
    }
  );

  // 4. หกโมงเย็น → 18:00, ห้าโมงเย็น → 17:00, หกโมงเช้า → 06:00
  result = result.replace(
    new RegExp(`(${THAI_NUM_PATTERN})\\s*โมง\\s*(เช้า|เย็น|บ่าย|ค่ำ)?`, 'g'),
    (_m, num: string, modifier: string) => {
      let h = THAI_NUM[num] ?? 0;
      if (modifier === 'เย็น' || modifier === 'ค่ำ') {
        h += 12;
      } else if (modifier === 'เช้า') {
        // keep as-is (e.g. 6 โมงเช้า = 06:00)
      } else if (modifier === 'บ่าย' || (!modifier && h >= 1 && h <= 5)) {
        // "บ่ายโมง" or "ห้าโมง" (evening assumed for 1-5 without modifier)
        h += 12;
      }
      return `${h.toString().padStart(2, '0')}:00`;
    }
  );

  // 5. เที่ยงคืน → 00:00
  result = result.replace(/เที่ยงคืน/g, '00:00');

  // 6. เที่ยง → 12:00 (but not "เที่ยงคืน" which is already handled)
  result = result.replace(/เที่ยง(?!คืน)/g, '12:00');

  // 7. บ่ายโมง → 13:00
  result = result.replace(/บ่าย\s*โมง/g, '13:00');

  // 8. บ่ายสอง → 14:00, บ่ายสาม → 15:00, บ่ายสี่ → 16:00, บ่ายห้า → 17:00, บ่ายหก → 18:00
  result = result.replace(
    new RegExp(`บ่าย\\s*(${THAI_NUM_PATTERN})`, 'g'),
    (_m, num: string) => {
      const h = THAI_NUM[num] ?? 1;
      return `${(h + 12).toString().padStart(2, '0')}:00`;
    }
  );

  return result;
}

// ── POST /api/v1/analyze ──
router.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const { text } = AnalyzeSchema.parse(body);

    // Pre-process: normalize Thai time expressions in the original text
    const normalizedText = normalizeTimeExpressions(text);

    const systemPrompt = `You extract incident data from Thai text and return ONLY a valid JSON object.

Return this exact JSON format:
{"title":"...", "description":"...", "location":"...", "reporter_name":"...", "reporter_contact":"...", "incident_type":"...", "priority":"..."}

Rules:
- title: short Thai headline (max 100 chars). Summarize the key event, include the time if present (already in HH:MM format).
- description: the original user text (with time expressions already normalized to HH:MM format).
- location: where it happened. Be specific when possible. If unclear use "ไม่ระบุ"
- reporter_name: who reported. If unclear use "ไม่ระบุ"
- reporter_contact: phone/contact. If unclear use "ไม่ระบุ"
- incident_type: Match the closest category from this list: ${INCIDENT_TYPES.join(', ')}.
  Examples:
    แผ่นดินไหว, น้ำท่วม, พายุ, ฟ้าผ่า → "ภัยธรรมชาติ"
    ไฟไหม้, เพลิงไหม้ → "อัคคีภัย"
    รถชน, ล้ม, กระแทก → "อุบัติเหตุ"
    ทะเลาะ, ทำร้าย, วิวาท → "ทะเลาะวิวาท"
    ขโมย, ทรัพย์สินเสียหาย, แตกหัก → "ทรัพย์สินเสียหาย"
    ไข้, ป่วย, เจ็บป่วย, หัวใจ → "เจ็บป่วย"
    คนแปลกหน้า, บุกรุก, แอบ → "บุกรุก"
    ไฟดับ, ไฟกระชาก, สายไฟ → "ไฟฟ้าขัดข้อง"
  Use "เหตุร้ายแรงอื่นๆ" only if none of the above match.
- priority: one of [LOW, MEDIUM, HIGH, CRITICAL]. Judge from severity.
  Examples: เสียชีวิต→CRITICAL, บาดเจ็บ/เลือดออก→HIGH, ทะเลาะ→MEDIUM, เสียหายเล็กน้อย→LOW

Return ONLY the JSON object. No markdown, no code fences.`;

    const userPrompt = `Extract from this text:\n\n${normalizedText}`;

    const response = await c.env.AI.run('@cf/meta/llama-3.2-3b-instruct', {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });

    const responseObj = response as any;

    let parsed: Record<string, string>;
    if (responseObj?.response && typeof responseObj.response === 'object' && !Array.isArray(responseObj.response)) {
      parsed = responseObj.response as Record<string, string>;
    } else {
      try {
        const rawText = typeof responseObj?.response === 'string'
          ? responseObj.response
          : JSON.stringify(responseObj);
        const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);
      } catch {
        parsed = fallbackParse(normalizedText);
      }
    }

    // Post-processing: override AI when it misses obvious fields
    // 1. Type — smartClassify overrides if AI got it wrong
    const finalType = smartClassifyWithAI(normalizedText, parsed.incident_type);

    // 2. Location — smart extraction always preferred when text has location keywords
    let finalLocation = parsed.location || 'ไม่ระบุ';
    const smartLoc = smartExtractLocation(normalizedText);
    if (smartLoc) {
      // Always use smart location when available (it's keyword-based and more reliable than AI)
      finalLocation = smartLoc;
    }

    // 3. Reporter name — validate and fix if AI produced garbage
    let finalReporter = parsed.reporter_name || 'ไม่ระบุ';
    // If AI returned "ไม่ระบุ" OR the name looks suspicious (too long, contains verbs), use smart extraction
    if (
      finalReporter === 'ไม่ระบุ' ||
      finalReporter === '' ||
      finalReporter.length > 18 ||
      /แจ้ง|รายงาน|โทร|ภายใน|เวลา|วันที่|เกิด|เหตุ/.test(finalReporter)
    ) {
      const smartReporter = smartExtractReporter(normalizedText);
      if (smartReporter) finalReporter = smartReporter;
    }
    // Final cleanup: strip trailing verbs/adverbs, and re-validate
    finalReporter = finalReporter.replace(/\s+$/, '').trim();
    // If after cleanup the name contains verbs, use simpler fallback
    if (/แจ้ง|โทร|เห็น|บอก/.test(finalReporter)) {
      finalReporter = 'ไม่ระบุ';
      const fallback = normalizedText.match(/(?:ครู|คุณครู|คุณ|นาย|นาง|นางสาว)[\u0E00-\u0E7F]{2,6}(?:\s[\u0E00-\u0E7F]{2,6})?/);
      if (fallback && !/แจ้ง|โทร|เห็น|บอก/.test(fallback[0])) {
        finalReporter = fallback[0];
      }
    }

    // 4. Title — clean up: strip leading time/date and truncate if needed
    let finalTitle = parsed.title || normalizedText.slice(0, 60);
    // Strip leading time like "20:00" or "10:45"
    finalTitle = finalTitle.replace(/^\d{2}:\d{2}/, '').trim();
    // Strip leading "น." (abbreviation leftover after time removal)
    finalTitle = finalTitle.replace(/^น\.\s*/, '').trim();
    // Strip leading date/time patterns like "เมื่อวันที่..."
    finalTitle = finalTitle.replace(/^(เมื่อ|เมื่อวันที่|วันที่|วันนี้|เมื่อตอน)\s*[^ก-ฮ]{0,30}?\s*/i, '').trim();
    // If title is still too long, truncate
    if (finalTitle.length > 60) {
      finalTitle = finalTitle.slice(0, 57) + '...';
    }
    finalTitle = finalTitle.slice(0, 100);

    // 5. Priority — pick the max severity between AI and smart rules
    const PRIO_ORDER: Record<string, number> = { 'LOW': 0, 'MEDIUM': 1, 'HIGH': 2, 'CRITICAL': 3 };
    let aiParsedPrio = (parsed.priority || '').toUpperCase();
    const aiPrio = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(aiParsedPrio) ? aiParsedPrio : 'MEDIUM';
    const smartPrio = smartPriority(normalizedText);
    const finalPriority = PRIO_ORDER[smartPrio] > PRIO_ORDER[aiPrio] ? smartPrio : aiPrio;

    // 6. Contact — extract phone number if AI missed it or returned 'ไม่ระบุ'
    let finalContact = parsed.reporter_contact || 'ไม่ระบุ';
    const phone = normalizedText.match(/0[0-9\- ]{7,12}/);
    if (phone) {
      const cleaned = phone[0].trim();
      if (cleaned.length >= 9 && cleaned.length <= 12) finalContact = cleaned;
    }

    const result = {
      title: finalTitle,
      description: normalizedText,
      location: finalLocation,
      reporter_name: finalReporter,
      reporter_contact: finalContact,
      incident_type: finalType,
      priority: finalPriority,
    };

    return c.json({ success: true, data: result, original_text: text });
  } catch (error) {
    return handleError(c, error);
  }
});

// smartClassify but respects AI's answer when it's confidently correct
function smartClassifyWithAI(text: string, aiType: string): string {
  if (INCIDENT_TYPES.includes(aiType as any)) {
    const smart = smartClassify(text);
    // Prefer smart classification when keywords are explicit
    if (smart !== 'เหตุร้ายแรงอื่นๆ') return smart;
    return aiType;
  }
  return smartClassify(text);
}

// Smart location extraction: override AI when it returns "ไม่ระบุ"
function smartExtractLocation(text: string): string | null {
  const t = text;

  // "ภายใน XXX" pattern (most specific) — uses manual stopword trimming for reliable behavior
  const inside = t.match(/ภายใน\s*([^\s,\.]+(?:\s+[^\s,\.]+){0,5})/);
  if (inside) {
    let loc = inside[1].trim();
    const stopWords = ['เจ้าหน้าที่', 'มี', 'ไม่มี', 'และ', 'โดย', 'ได้', 'เพื่อ', 'ซึ่ง', 'แต่'];
    for (const sw of stopWords) {
      const idx = loc.indexOf(sw);
      if (idx > 0) { loc = loc.substring(0, idx).trim(); break; }
    }
    if (loc.length > 2) return loc;
  }

  // Building + room/number
  const building = t.match(/(?:อาคาร|ตึก)\s*\d+/);
  const floor = t.match(/ชั้น\s*\d+/);
  const room = t.match(/ห้อง[^\s,\.]{2,20}/);
  if (room && building) return room[0] + ' ' + building[0];
  if (room) return room[0];
  if (building) return building[0];
  if (floor) return floor[0];

  // Generic area keyword + following word
  const area = t.match(/(?:บริเวณ|สนาม|หน้า|หลัง|ข้าง)\s*[^\s,\.]{2,15}/);
  if (area) return area[0];

  return null;
}

// Smart post-classification as a safety net when AI gets the type wrong
function smartClassify(text: string): string {
  const t = text.toLowerCase();
  if (t.includes('แผ่นดินไหว') || t.includes('น้ำท่วม') || t.includes('พายุ') || t.includes('ฟ้าผ่า') || t.includes('ดินถล่ม') || t.includes('สึนามิ') || t.includes('อากาศ')) return 'ภัยธรรมชาติ';
  if (t.includes('ไฟไหม้') || t.includes('เพลิง')) return 'อัคคีภัย';
  if (t.includes('ทะเลาะ') || t.includes('วิวาท') || t.includes('ทำร้าย') || t.includes('ชก') || t.includes('เตะ') || t.includes('ตบ')) return 'ทะเลาะวิวาท';
  if (t.includes('รถ') || t.includes('เฉี่ยว') || t.includes('ชน') || t.includes('ล้ม') || t.includes('อุบัติเหตุ')) return 'อุบัติเหตุ';
  if (t.includes('ป่วย') || t.includes('เจ็บ') || t.includes('ไข้') || t.includes('หัวใจ') || t.includes('หมดสติ')) return 'เจ็บป่วย';
  if (t.includes('ขโมย') || t.includes('ทรัพย์') || t.includes('หาย') || t.includes('สูญหาย') || t.includes('แตก')) return 'ทรัพย์สินเสียหาย';
  if (t.includes('บุกรุก') || t.includes('แอบ') || t.includes('แปลก')) return 'บุกรุก';
  if (t.includes('ไฟดับ') || t.includes('ไฟฟ้า') || t.includes('สายไฟ') || t.includes('ช็อต')) return 'ไฟฟ้าขัดข้อง';
  return 'เหตุร้ายแรงอื่นๆ';
}

function smartExtractReporter(text: string): string | null {
  // Stop words: break name at these
  const STOP = ['แจ้ง', 'โทร', 'เห็น', 'รายงาน', 'บอก', 'อยู่', 'เข้า', 'ออก'];

  // Trim name at the EARLIEST stop word (smallest index), return only the prefix
  function trimAtStop(raw: string): string | null {
    let bestIdx = -1;
    let bestSw = '';
    for (const sw of STOP) {
      const idx = raw.indexOf(sw);
      if (idx >= 2 && (bestIdx === -1 || idx < bestIdx)) {
        bestIdx = idx;
        bestSw = sw;
      }
    }
    if (bestIdx >= 2) {
      const candidate = raw.substring(0, bestIdx).trim();
      const thaiCount = (candidate.match(/[\u0E00-\u0E7F]/g) || []).length;
      if (thaiCount >= 2 && thaiCount <= 12) return candidate;
    }
    // No stop word found: validate the whole string
    const thaiCount = (raw.match(/[\u0E00-\u0E7F]/g) || []).length;
    if (thaiCount >= 2 && thaiCount <= 12) return raw;
    return null;
  }

  // Pattern 1: Title prefix (most reliable)
  const m1 = text.match(/(?:ครู|คุณครู|คุณ|นาย|นาง|นางสาว|เด็กชาย|เด็กหญิง)[\u0E00-\u0E7F]{2,12}(?:\s[\u0E00-\u0E7F]{2,6})?/);
  if (m1) {
    const result = trimAtStop(m1[0].trim());
    if (result) return result;
  }

  // Pattern 2: Name before แจ้ง/รายงาน/โทร (preceded by whitespace)
  const m2 = text.match(/(?:^|[\s])([\u0E00-\u0E7F]{2,8})\s*(?:แจ้ง|รายงาน|โทร)/);
  if (m2) {
    const result = trimAtStop(m2[1].trim());
    if (result && result.length >= 2) return result;
  }

  // Pattern 3: Name after keywords
  const m3 = text.match(/(?<=แจ้ง|รายงาน)\s*(?:โดย\s*)?([\u0E00-\u0E7F]{4,15})/);
  if (m3) {
    const result = trimAtStop(m3[1].trim());
    if (result && result.length >= 2) return result;
  }

  return null;
}

function smartPriority(text: string): string {
  const t = text.toLowerCase();
  
  // Exceptions: explicit "no fatalities" → cap at HIGH even if other critical keywords match
  const hasNoFatalities = t.includes('ไม่มีผู้เสียชีวิต') || t.includes('ไม่เสียชีวิต') || t.includes('ปลอดภัย');
  
  // CRITICAL indicators
  if (!hasNoFatalities) {
    if (t.includes('เสียชีวิต') || t.includes('สาหัส') || t.includes('วิกฤต') || t.includes('หมดสติ') || t.includes('ช็อค') || t.includes('แผ่นดินไหว') || t.includes('สึนามิ') || t.includes('หายนะ')) return 'CRITICAL';
  }
  
  // HIGH indicators
  if (t.includes('บาดเจ็บ') || t.includes('ไฟไหม้') || t.includes('เพลิง') || t.includes('น้ำท่วม') || t.includes('เลือด') || t.includes('หัก') || t.includes('รุนแรง') || t.includes('วิ่งหนี') || t.includes('สู้') || t.includes('สูดดม') || t.includes('ควัน') || t.includes('อพยพ') || t.includes('สาหัส')) return 'HIGH';
  
  if (t.includes('ทะเลาะ') || t.includes('สบาย') || t.includes('เล็กน้อย')) return 'MEDIUM';
  return 'MEDIUM';
}

function fallbackParse(text: string): Record<string, string> {
  const firstLine = text.split(/[\n]/)[0]?.trim() || text.slice(0, 80);
  const nameMatch = text.match(/(?:ครู|คุณ|นาย|นาง|นางสาว|เด็กชาย|เด็กหญิง)([^\s]+)/);
  const phoneMatch = text.match(/0[0-9\- ]{8,}/);

  let fallbackType = 'เหตุร้ายแรงอื่นๆ';
  if (text.includes('ไฟไหม้') || text.includes('เพลิง')) fallbackType = 'อัคคีภัย';
  else if (text.includes('แผ่นดินไหว') || text.includes('น้ำท่วม') || text.includes('พายุ') || text.includes('ฟ้าผ่า')) fallbackType = 'ภัยธรรมชาติ';
  else if (text.includes('ทะเลาะ') || text.includes('วิวาท') || text.includes('ทำร้าย')) fallbackType = 'ทะเลาะวิวาท';
  else if (text.includes('อุบัติเหตุ') || text.includes('รถ') || text.includes('เฉี่ยว') || text.includes('ชน') || text.includes('ล้ม')) fallbackType = 'อุบัติเหตุ';
  else if (text.includes('ป่วย') || text.includes('เจ็บ') || text.includes('ไข้')) fallbackType = 'เจ็บป่วย';
  else if (text.includes('ขโมย') || text.includes('ทรัพย์') || text.includes('แตก')) fallbackType = 'ทรัพย์สินเสียหาย';
  else if (text.includes('บุกรุก') || text.includes('แอบ')) fallbackType = 'บุกรุก';
  else if (text.includes('ไฟดับ') || text.includes('ไฟฟ้า')) fallbackType = 'ไฟฟ้าขัดข้อง';

  let fallbackPriority = 'MEDIUM';
  if (text.includes('เสียชีวิต') || text.includes('สาหัส') || text.includes('วิกฤต')) fallbackPriority = 'CRITICAL';
  else if (text.includes('บาดเจ็บ') || text.includes('ไฟไหม้') || text.includes('เลือด') || text.includes('สาหัส')) fallbackPriority = 'HIGH';

  return {
    title: firstLine.slice(0, 80),
    location: text.match(/อาคาร[^\s]*\s*[^\s,\.]*/)?.[0] || 'ไม่ระบุ',
    reporter_name: nameMatch ? nameMatch[0] : 'ไม่ระบุ',
    reporter_contact: phoneMatch ? phoneMatch[0].trim() : 'ไม่ระบุ',
    incident_type: fallbackType,
    priority: fallbackPriority,
  };
}

export default router;
