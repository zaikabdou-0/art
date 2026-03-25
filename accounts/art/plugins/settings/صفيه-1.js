
// ══════════════════════════════════════════════════════════════

const wait  = ms => new Promise(r => setTimeout(r, ms));
const numOf = jid => (jid && typeof jid === 'string') ? jid.split('@')[0].split(':')[0] : '';
const toJid = num => num.replace(/\D/g, '') + '@s.whatsapp.net';

export const NovaUltra = {
    command:     'صفيه',
    description: 'طرد شخص من كل المجموعات المشتركة',
    group:       false,
    elite:       'on',   // ← messages.js يحمي التنفيذ: أونر + نخبة فقط
    prv:         true,
    lock:        'off',
};

export async function execute({ sock, msg, BIDS, sender }) {
    const chatId = msg.key.remoteJid;

    // ── استخراج botNum ───────────────────────────────────────
    const botNum = numOf(BIDS?.pn || sock.user?.id || '');

    // ── نص الرسالة الحالية ───────────────────────────────────
    const rawText = (
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text || ''
    ).trim();

    // ── تنظيف الجلسة ─────────────────────────────────────────
    const cleanup = () => {
        clearTimeout(timer);
        sock.ev.off('messages.upsert', phoneListener);
        if (sock.activeListeners) sock.activeListeners.delete(chatId);
    };

    // ── Listener ينتظر الرقم في الرسالة التالية ──────────────
    const phoneListener = async ({ messages }) => {
        const m = messages[0];
        if (!m?.message) return;
        if (m.key.remoteJid !== chatId) return;
        if (m.key.fromMe) return;

        // تحقق نفس المرسل الأصلي (sender.pn هو phone JID كامل)
        const incomingSender = m.key.participant || m.key.remoteJid;
        if (numOf(incomingSender) !== numOf(sender.pn)) return;

        const input = (m.message.conversation || m.message.extendedTextMessage?.text || '').trim();
        if (!input) return;

        cleanup();

        const cleanNum = input.replace(/\D/g, '');
        if (!cleanNum || cleanNum.length < 7 || cleanNum.length > 15) {
            return sock.sendMessage(chatId, {
                text: '❌ *رقم غير صالح.* أعد تشغيل الأمر مع رقم صحيح.',
            }).catch(() => {});
        }

        await sock.sendMessage(chatId, {
            text: `🔍 *جاري البحث في كل المجموعات...*\n_الهدف:_ \`${cleanNum}\``,
        }).catch(() => {});

        // جلب كل المجموعات
        let allGroups = [];
        try {
            const chats = await sock.groupFetchAllParticipating();
            allGroups   = Object.values(chats);
        } catch (e) {
            return sock.sendMessage(chatId, {
                text: `❌ فشل جلب المجموعات: ${e?.message?.slice(0, 80)}`,
            }).catch(() => {});
        }

        const results = { kicked: [], notFound: [], notAdmin: [], failed: [] };

        for (const group of allGroups) {
            const gId = group.id;

            // تحقق أن البوت مشرف
            const botPart = group.participants?.find(p => numOf(p.id) === botNum);
            if (!botPart?.admin) {
                results.notAdmin.push(group.subject || gId);
                continue;
            }

            // تحقق أن الهدف موجود في المجموعة
            const targetPart = group.participants?.find(p => numOf(p.id) === cleanNum);
            if (!targetPart) {
                results.notFound.push(group.subject || gId);
                continue;
            }

            // الطرد
            try {
                await sock.groupParticipantsUpdate(gId, [targetPart.id], 'remove');
                results.kicked.push(group.subject || gId);
                await wait(600);
            } catch {
                results.failed.push(group.subject || gId);
            }
        }

        // ── تقرير النتائج ─────────────────────────────────────
        const lines = [];

        if (results.kicked.length) {
            lines.push(`✅ *طُرد من ${results.kicked.length} مجموعة:*`);
            results.kicked.forEach(n => lines.push(`  • ${n}`));
        }
        if (results.failed.length) {
            lines.push(`\n⚠️ *فشل الطرد في ${results.failed.length} مجموعة:*`);
            results.failed.forEach(n => lines.push(`  • ${n}`));
        }
        if (!results.kicked.length && !results.failed.length) {
            lines.push(`ℹ️ *لم يُوجد \`${cleanNum}\` في أي مجموعة أنت فيها مشرف.*`);
        }

        lines.push(`\n📊 *ملخص:*`);
        lines.push(`  طُرد: ${results.kicked.length}`);
        lines.push(`  مش موجود: ${results.notFound.length}`);
        lines.push(`  بدون إشراف: ${results.notAdmin.length}`);
        lines.push(`  فشل: ${results.failed.length}`);

        return sock.sendMessage(chatId, { text: lines.join('\n') }).catch(() => {});
    };

    // ── Timeout: دقيقة ───────────────────────────────────────
    const timer = setTimeout(async () => {
        sock.ev.off('messages.upsert', phoneListener);
        if (sock.activeListeners) sock.activeListeners.delete(chatId);
        await sock.sendMessage(chatId, {
            text: '⏱️ _انتهى وقت الانتظار._',
        }).catch(() => {});
    }, 60_000);

    // ── تسجيل الـ listener ───────────────────────────────────
    // activeListeners: يمنع messages.js من معالجة الرسالة كأمر
    if (sock.activeListeners) sock.activeListeners.set(chatId, cleanup);
    sock.ev.on('messages.upsert', phoneListener);

    // ── اطلب الرقم ───────────────────────────────────────────
    return sock.sendMessage(chatId, {
        text:
`🎯 *أمر التصفية*

📱 *أرسل رقم الهاتف* للشخص الذي تريد طرده من كل المجموعات المشتركة.

_مثال:_ \`966501234567\`
⏱️ _لديك 60 ثانية._`,
    }, { quoted: msg }).catch(() => {});
}

export default { NovaUltra, execute };
