// ══════════════════════════════════════════════════════════════
//  ارفعني.js — يرفع النخبة/الأونر مشرفاً في قروب مقفل
//  الاستخدام في الخاص: .ارفعني [رابط القروب أو JID]
// ══════════════════════════════════════════════════════════════

const normalizeJid = jid =>
    jid ? jid.split('@')[0].split(':')[0].replace(/\D/g, '') : '';

const NovaUltra = {
    command:     'ارفعني',
    description: 'ترفع نفسك مشرفاً في قروب عبر الخاص (للنخبة)',
    elite:       'on',
    group:       false,
    prv:         true,
    lock:        'off',
};

async function execute({ sock, msg, args, sender, BIDS }) {
    const chatId    = msg.key.remoteJid;
    const senderJid = sender?.pn || msg.key.participant || chatId;

    const react = emoji =>
        sock.sendMessage(chatId, { react: { text: emoji, key: msg.key } }).catch(() => {});
    const reply = text =>
        sock.sendMessage(chatId, { text }, { quoted: msg });

    // ── فحص الصلاحية: نخبة أو أونر ──
    const isOwner  = msg.key.fromMe;
    const isElite  = isOwner || await sock.isElite?.({ sock, id: senderJid }).catch(() => false);
    if (!isElite) {
        await react('🚫');
        return;
    }

    // ── تحديد القروب ──
    const input = args.join(' ').trim();
    let groupJid = null;

    // ── أولاً: لو رد على رسالة قروب (مثل الصورة) ──
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    if (ctx?.remoteJid?.endsWith('@g.us')) {
        groupJid = ctx.remoteJid;
    } else if (ctx?.quotedMessage && ctx?.participant) {
        // الرسالة المقتبسة من قروب
        const possibleJid = ctx?.remoteJid || chatId;
        if (possibleJid?.endsWith('@g.us')) groupJid = possibleJid;
    }

    // لو حصلنا القروب من الاقتباس → نكمل مباشرة
    if (groupJid) {
        // سنقفز لخطوة الرفع بعد التحقق
    } else if (!input) {
        // لو ما أعطى رابط ولا اقتباس → اعرض القروبات اللي البوت فيها
        try {
            const all    = await sock.groupFetchAllParticipating();
            const groups = Object.values(all);
            if (!groups.length) return reply('📭 البوت ليس في أي مجموعة.');

            const list = groups
                .sort((a, b) => (b.participants?.length || 0) - (a.participants?.length || 0))
                .slice(0, 15)
                .map((g, i) => `${i + 1}. *${g.subject || '—'}*\n   \`${g.id}\``)
                .join('\n\n');

            return reply(
                `📋 *القروبات المتاحة:*\n\n${list}\n\n` +
                `انسخ الـ JID وأرسل:\n*.ارفعني [JID]*`
            );
        } catch (e) {
            return reply(`❌ ${e?.message}`);
        }
    }

    // ── استخراج JID من رابط أو نص مباشر ──
    const linkMatch = input.match(/chat\.whatsapp\.com\/([A-Za-z0-9]+)/);
    if (linkMatch) {
        // رابط دعوة → نحاول نحصل JID
        try {
            const info = await sock.groupGetInviteInfo(linkMatch[1]);
            groupJid   = info?.id;
        } catch {
            return reply('❌ الرابط غير صالح أو انتهت صلاحيته.');
        }
    } else if (input.includes('@g.us')) {
        groupJid = input.trim();
    } else {
        // بحث بالاسم
        try {
            const all  = await sock.groupFetchAllParticipating();
            const found = Object.values(all).find(g =>
                (g.subject || '').toLowerCase().includes(input.toLowerCase())
            );
            groupJid = found?.id || null;
        } catch (_e) {}

        if (!groupJid) {
            return reply(
                '❌ ما عرفت القروب.\n\n' +
                'أرسل `.ارفعني` مع رد على رسالة من القروب، أو بدون شيء لتشوف القروبات.'
            );
        }
    }

    // ── تأكد أن البوت في القروب وهو مشرف ──
    let meta;
    try {
        meta = await sock.groupMetadata(groupJid);
    } catch {
        return reply('❌ البوت ليس في هذا القروب أو الـ JID خاطئ.');
    }

    const botJid   = (BIDS?.pn || sock.user?.id || '').split(':')[0] + '@s.whatsapp.net';
    const botNum   = normalizeJid(botJid);
    const admins   = meta.participants.filter(p => p.admin);
    const isBotAdm = admins.some(p => normalizeJid(p.id) === botNum);

    if (!isBotAdm) {
        return reply(
            `❌ البوت ليس مشرفاً في *${meta.subject}*\n` +
            `ارفعه يدوياً أولاً ثم أعد المحاولة.`
        );
    }

    // ── رفع المستخدم ──
    const targetJid = senderJid.includes('@') ? senderJid : senderJid + '@s.whatsapp.net';
    const targetNum = normalizeJid(targetJid);

    // تأكد أنه موجود في القروب
    const inGroup = meta.participants.some(p => normalizeJid(p.id) === targetNum);
    if (!inGroup) {
        return reply(`❌ أنت لست عضواً في *${meta.subject}*`);
    }

    // تأكد أنه مو مشرف بالفعل
    const alreadyAdmin = admins.some(p => normalizeJid(p.id) === targetNum);
    if (alreadyAdmin) {
        return reply(`✅ أنت بالفعل مشرف في *${meta.subject}*`);
    }

    await react('⏳');
    try {
        await sock.groupParticipantsUpdate(groupJid, [targetJid], 'promote');
        await react('👑');
        await reply(`✅ *تم رفعك مشرفاً*\nفي: *${meta.subject}*`);
    } catch (e) {
        await react('❌');
        await reply(`❌ فشل الرفع: ${e?.message?.slice(0, 100)}`);
    }
}

export default { NovaUltra, execute };
