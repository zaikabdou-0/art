// ══════════════════════════════════════════════════════════════
//  صفيه.js — طرد شخص من كل المجموعات المشتركة
//  الاستخدام: .صفيه ثم أرسل رقم الهاتف
//  الشرط: البوت مشرف في المجموعة
// ══════════════════════════════════════════════════════════════

const wait   = ms => new Promise(r => setTimeout(r, ms));
const numOf  = jid => jid ? jid.split("@")[0].split(":")[0] : "";
const toJid  = num => num.replace(/\D/g, "") + "@s.whatsapp.net";

// جلسات انتظار الرقم — chatId → senderJid
const pendingInput = new Map();

export const NovaUltra = {
    command:     "صفيه",
    description: "طرد شخص من كل المجموعات المشتركة",
    group:       false,
    elite:       "off",
    prv:         true,
    lock:        "off",
};

export async function execute({ sock, msg, args, BIDS }) {
    const chatId    = msg.key.remoteJid;
    const senderRaw = msg.key.participant || msg.key.remoteJid;
    const senderNum = numOf(senderRaw);
    const ownerNum  = (global._botConfig?.owner || "").replace(/\D/g, "");
    const botNum    = numOf(BIDS?.pn || sock.user?.id || "");

    // فقط المالك يقدر يستخدم الأمر
    if (senderNum !== ownerNum) {
        return sock.sendMessage(chatId, {
            text: "⛔ *هذا الأمر للمالك فقط.*",
        });
    }

    // ── إذا في جلسة انتظار — هذه هي الرسالة التالية (الرقم) ─
    if (pendingInput.has(chatId)) {
        const rawInput = (
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text || ""
        ).trim();

        pendingInput.delete(chatId);

        const cleanNum = rawInput.replace(/\D/g, "");
        if (!cleanNum || cleanNum.length < 7 || cleanNum.length > 15) {
            return sock.sendMessage(chatId, {
                text: "❌ *رقم غير صالح.* أعد المحاولة مع رقم صحيح.",
            });
        }

        const targetJid = toJid(cleanNum);

        await sock.sendMessage(chatId, {
            text: `🔍 *جاري البحث في كل المجموعات...*\n_الهدف:_ \`${cleanNum}\``,
        });

        // جلب كل المجموعات
        let allGroups = [];
        try {
            const chats = await sock.groupFetchAllParticipating();
            allGroups   = Object.values(chats);
        } catch (e) {
            return sock.sendMessage(chatId, {
                text: `❌ فشل جلب المجموعات: ${e.message?.slice(0, 80)}`,
            });
        }

        const results = { kicked: [], notFound: [], notAdmin: [], failed: [] };

        for (const group of allGroups) {
            const gId = group.id;

            // تحقق أن البوت مشرف
            const botParticipant = group.participants?.find(
                p => numOf(p.id) === botNum
            );
            if (!botParticipant?.admin) {
                results.notAdmin.push(group.subject || gId);
                continue;
            }

            // تحقق أن الهدف موجود في المجموعة
            const targetInGroup = group.participants?.find(
                p => numOf(p.id) === cleanNum
            );
            if (!targetInGroup) {
                results.notFound.push(group.subject || gId);
                continue;
            }

            // الطرد
            try {
                await sock.groupParticipantsUpdate(gId, [targetInGroup.id], "remove");
                results.kicked.push(group.subject || gId);
                await wait(600); // تأخير بين كل طرد
            } catch (e) {
                results.failed.push(group.subject || gId);
            }
        }

        // ── تقرير النتائج ──────────────────────────────────────
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

        return sock.sendMessage(chatId, { text: lines.join("\n") });
    }

    // ── الأمر الأول — اطلب الرقم ─────────────────────────────
    pendingInput.set(chatId, senderNum);

    // نظّف الجلسة بعد دقيقة تلقائياً
    setTimeout(() => pendingInput.delete(chatId), 60_000);

    return sock.sendMessage(chatId, {
        text:
`🎯 *أمر التصفية*

📱 *أرسل رقم الهاتف* للشخص الذي تريد طرده من كل المجموعات المشتركة.

_مثال:_ \`966501234567\`
⏱️ _لديك 60 ثانية._`,
    });
}

export default { NovaUltra, execute };
