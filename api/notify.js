/* /api/notify — batch-ready approval email (POST)
   Nick calls this once a batch of SEO_AUDIT_LOG.md changes is proposed and
   ready for Jacob to review. Sends one email via Resend to Jacob's inbox.

   Token-gated like /moderation's mod:* routes (api/threads.js) — this sends
   real email to a real inbox, so unlike /api/subscribe and /api/track it
   fails CLOSED on missing config rather than soft-200ing past it.

   The approver address is fixed, not env-configured: this endpoint has
   exactly one purpose (get Jacob's attention on a pending batch), so an
   env var here would be indirection with no real flexibility behind it. */

const APPROVER_EMAIL = 'jake@nicotiamarket.com';
const FROM_ADDRESS = 'Nicotia Market <onboarding@resend.dev>';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });

  const token = req.headers['x-notify-token'] || new URL(req.url, 'http://x').searchParams.get('token') || '';
  const expected = process.env.NM_NOTIFY_TOKEN || '';
  if (!expected || token !== expected) {
    return res.status(403).json({ ok: false, error: 'forbidden' });
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    return res.status(500).json({ ok: false, error: 'RESEND_API_KEY not configured' });
  }

  const body = typeof req.body === 'string' ? safeParse(req.body) : (req.body || {});
  const subject = String(body.subject || '').trim() || 'Nicotia Market: a batch is ready for approval';
  const summary = String(body.summary || '').trim();
  const link = String(body.link || '').trim();

  if (!summary) {
    return res.status(400).json({ ok: false, error: 'summary required' });
  }

  const html =
    '<p>' + escapeHtml(summary).replace(/\n/g, '<br>') + '</p>' +
    (link ? '<p><a href="' + escapeHtml(link) + '">' + escapeHtml(link) + '</a></p>' : '') +
    '<p style="color:#888;font-size:12px">Approve or reject each item in SEO_AUDIT_LOG.md.</p>';

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [APPROVER_EMAIL],
        subject,
        html,
      }),
    });

    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      return res.status(502).json({ ok: false, error: 'resend rejected the send', detail });
    }

    return res.status(200).json({ ok: true, sent: true });
  } catch (e) {
    return res.status(502).json({ ok: false, error: e.message });
  }
}

function safeParse(s) { try { return JSON.parse(s); } catch { return {}; } }
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
