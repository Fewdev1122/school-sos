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
    const finalType = INCIDENT_TYPES.includes(parsed.incident_type as any)
      ? parsed.incident_type
      : smartClassify(normalizedText);

    // Fix reporter name if AI missed it
    let finalReporter = parsed.reporter_name || 'ไม่ระบุ';
    if (finalReporter === 'ไม่ระบุ' || finalReporter === 'ไม่ระบุ') {
      const smartReporter = smartExtractReporter(normalizedText);
      if (smartReporter) finalReporter = smartReporter;
    }

    // Pick the max severity between AI and smart rules
    const PRIO_ORDER: Record<string, number> = { 'LOW': 0, 'MEDIUM': 1, 'HIGH': 2, 'CRITICAL': 3 };
    const aiPrio = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(parsed.priority) ? parsed.priority : 'MEDIUM';
    const smartPrio = smartPriority(normalizedText);
    const finalPriority = PRIO_ORDER[smartPrio] > PRIO_ORDER[aiPrio] ? smartPrio : aiPrio;

    const result = {
      title: (parsed.title || normalizedText.slice(0, 80) + '...').slice(0, 100),
      description: normalizedText,
      location: parsed.location || 'ไม่ระบุ',
      reporter_name: finalReporter,
      reporter_contact: parsed.reporter_contact || 'ไม่ระบุ',
      incident_type: finalType,
      priority: finalPriority,
    };

    return c.json({ success: true, data: result, original_text: text });
  } catch (error) {
    return handleError(c, error);
  }
});

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
  // Grab title + next few Thai chars (greedy, but better than nothing)
  const match = text.match(/(?:ครู|คุณครู|คุณ|นาย|นาง|นางสาว|เด็กชาย|เด็กหญิง)[\u0E00-\u0E7F]{2,8}/);
  return match ? match[0] : null;
}

function smartPriority(text: string): string {
  const t = text.toLowerCase();
  if (t.includes('เสียชีวิต') || t.includes('สาหัส') || t.includes('วิกฤต') || t.includes('หมดสติ') || t.includes('ช็อค') || t.includes('แผ่นดินไหว') || t.includes('สึนามิ')) return 'CRITICAL';
  if (t.includes('บาดเจ็บ') || t.includes('ไฟไหม้') || t.includes('น้ำท่วม') || t.includes('เลือด') || t.includes('หัก') || t.includes('รุนแรง') || t.includes('วิ่งหนี') || t.includes('สู้')) return 'HIGH';
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
