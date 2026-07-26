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

const INCIDENT_TYPES = [
  'อุบัติเหตุ', 'ทะเลาะวิวาท', 'ทรัพย์สินเสียหาย', 'เจ็บป่วย',
  'บุกรุก', 'อัคคีภัย', 'เหตุร้ายแรงอื่นๆ',
] as const;

// ── POST /api/v1/analyze ──
router.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const { text } = AnalyzeSchema.parse(body);

    const systemPrompt = `You extract incident data from Thai text and return ONLY a valid JSON object. No markdown, no code fences, no extra text.

Return this exact JSON format (fill in the values, keep the keys):
{"title":"...", "description":"...", "location":"...", "reporter_name":"...", "reporter_contact":"...", "incident_type":"...", "priority":"..."}

Rules:
- title: short Thai headline (max 100 chars), extracted from the text
- description: keep the original user text
- location: where it happened. If unclear use "ไม่ระบุ"
- reporter_name: who reported. If unclear use "ไม่ระบุ"
- reporter_contact: phone/contact. If unclear use "ไม่ระบุ"
- incident_type: one of [${INCIDENT_TYPES.join(', ')}]. If unclear use "เหตุร้ายแรงอื่นๆ"
- priority: one of [LOW, MEDIUM, HIGH, CRITICAL]. Judge from severity. Default MEDIUM.

Example:
Input: "นักเรียนทะเลาะวิวาทกันหน้าอาคาร 3 คุณครูสมชายเห็นเหตุการณ์ โทร 081-234-5678"
Output: {"title":"นักเรียนทะเลาะวิวาทหน้าอาคาร 3","description":"นักเรียนทะเลาะวิวาทกันหน้าอาคาร 3 คุณครูสมชายเห็นเหตุการณ์ โทร 081-234-5678","location":"อาคาร 3","reporter_name":"คุณครูสมชาย","reporter_contact":"081-234-5678","incident_type":"ทะเลาะวิวาท","priority":"MEDIUM"}

Return ONLY the JSON object.`;

    const userPrompt = `Extract from this text:\n\n${text}`;

    const response = await c.env.AI.run('@cf/meta/llama-3.2-3b-instruct', {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });

    const responseObj = response as any;

    // The AI returns a response object directly (already structured)
    // responseObj.response is an object with our fields
    let parsed: Record<string, string>;

    if (responseObj?.response && typeof responseObj.response === 'object' && !Array.isArray(responseObj.response)) {
      // Direct structured response from the model
      parsed = responseObj.response as Record<string, string>;
    } else {
      // Fallback: try to extract JSON from text response
      try {
        const rawText = typeof responseObj?.response === 'string'
          ? responseObj.response
          : JSON.stringify(responseObj);
        const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);
      } catch {
        parsed = fallbackParse(text);
      }
    }

    const result = {
      title: (parsed.title || text.slice(0, 80) + '...').slice(0, 100),
      description: text,
      location: parsed.location || 'ไม่ระบุ',
      reporter_name: parsed.reporter_name || 'ไม่ระบุ',
      reporter_contact: parsed.reporter_contact || 'ไม่ระบุ',
      incident_type: INCIDENT_TYPES.includes(parsed.incident_type as any)
        ? parsed.incident_type
        : 'เหตุร้ายแรงอื่นๆ',
      priority: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(parsed.priority)
        ? parsed.priority
        : 'MEDIUM',
    };

    return c.json({ success: true, data: result, original_text: text });
  } catch (error) {
    return handleError(c, error);
  }
});

function fallbackParse(text: string): Record<string, string> {
  const firstLine = text.split(/[\n]/)[0]?.trim() || text.slice(0, 80);
  const nameMatch = text.match(/(?:ครู|คุณ|นาย|นาง|นางสาว|เด็กชาย|เด็กหญิง)([^\s]+)/);
  const phoneMatch = text.match(/0[0-9\- ]{8,}/);

  return {
    title: firstLine.slice(0, 80),
    location: text.includes('อาคาร') ? text.match(/อาคาร[^\s]*\s*[^\s,\.]*/)?.[0] || 'ไม่ระบุ' : 'ไม่ระบุ',
    reporter_name: nameMatch ? nameMatch[0] : 'ไม่ระบุ',
    reporter_contact: phoneMatch ? phoneMatch[0].trim() : 'ไม่ระบุ',
    incident_type: ['อุบัติเหตุ', 'ทะเลาะวิวาท', 'เจ็บป่วย'].find(t => text.includes(t)) || 'เหตุร้ายแรงอื่นๆ',
    priority: text.includes('รุนแรง') || text.includes('วิกฤต') || text.includes('สาหัส') ? 'HIGH' : 'MEDIUM',
  };
}

export default router;
