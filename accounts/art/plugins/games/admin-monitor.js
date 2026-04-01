// ========== مراقب صلاحيات المشرفين ==========

import chalk from 'chalk';
import fs    from 'fs-extra';
import path  from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR  = path.resolve(__dirname, '../../nova/data');
const GRP_FILE  = path.join(DATA_DIR, 'admin_monitor_group.json');
fs.ensureDirSync(DATA_DIR);

// ── قراءة الجروب المحفوظ ──────────────────────────────────────
function loadGroup() {
    try { return fs.readJsonSync(GRP_FILE); } catch { return null; }
}

// ── تسجيل الـ handler مرة واحدة ──────────────────────────────
if (!global.groupEvHandlers) global.groupEvHandlers = [];

const HANDLER_ID = "__adminMonitor__";
if (!global[HANDLER_ID]) {
    global[HANDLER_ID] = true;

    global.groupEvHandlers.push(async (sock, update) => {
        try {
            const saved = loadGroup();
            if (!saved?.jid) return; // مفيش جروب محدد

            const NOTIFY_JID = saved.jid;

            console.log(chalk.bgYellow.black(" [ADMIN MONITOR] "), "update:", JSON.stringify(update));

            const { participants, action, author, id: groupId } = update;

            if (action !== "promote" && action !== "demote") {
                console.log(chalk.gray(`[ADMIN MONITOR] action ignored: ${action}`));
                return;
            }

            const BOT_JID = sock.user?.id?.split(":")[0] + "@s.whatsapp.net";

            const authorRaw = typeof author === "object"
                ? (author?.phoneNumber || author?.id || "غير معروف")
                : (author || "غير معروف");

            let groupName = groupId;
            let groupLink = groupId;
            let authorPn  = authorRaw;

            try {
                const metadata = await sock.groupMetadata(groupId);
                groupName = metadata.subject || groupId;

                let inviteCode = null;
                try {
                    inviteCode = await sock.groupInviteCode(groupId);
                } catch {
                    try {
                        const info = await sock.groupInviteInfo(groupId);
                        inviteCode = info?.inviteCode || null;
                    } catch {}
                }

                if (inviteCode) {
                    groupLink = `https://chat.whatsapp.com/${inviteCode}`;
                } else {
                    const shortId = groupId.replace("@g.us", "");
                    groupLink = `https://chat.whatsapp.com/invite/${shortId}`;
                }

                if (authorRaw.endsWith("@lid")) {
                    const found = metadata.participants?.find(p =>
                        p.id === authorRaw || p.lidJid === authorRaw
                    );
                    if (found?.id && found.id.endsWith("@s.whatsapp.net")) {
                        authorPn = found.id;
                    } else if (found?.phoneNumber) {
                        authorPn = found.phoneNumber;
                    }
                }
            } catch {}

            const authorNum = authorPn.split("@")[0];
            if (authorNum === BOT_JID.split("@")[0]) return;

            const isPromote  = action === "promote";
            const emoji      = isPromote ? "⬆️" : "⬇️";
            const actionText = isPromote ? "تمت ترقيته مشرفاً" : "تم سحب إشرافه";
            const label      = isPromote ? "🟢 ترقية مشرف" : "🔴 إزالة إشراف";

            for (const target of participants) {
                const targetPn = typeof target === "object"
                    ? (target?.phoneNumber || target?.id || "")
                    : target;

                const targetNum = targetPn.split("@")[0];

                const toMention = (jid) => {
                    if (!jid || jid === "غير معروف") return null;
                    if (jid.endsWith("@s.whatsapp.net")) return jid;
                    return null;
                };

                const mentions = [toMention(targetPn), toMention(authorPn)].filter(Boolean);

                const msgText =
`${emoji} ${label}

🏷️ الجروب  : ${groupName}
👤 العضو   : @${targetNum}  ← ${actionText}
🧩 المنفّذ  : @${authorNum}
🕐 الوقت   : ${new Date().toLocaleString('ar-DZ', { hour12: false })}

🌿 .ৎ˚₊‧ *⏤͟͟͞͞✧⸾ ⁽ 🜸 ₎ رابــط الجـروب 🗞️𓏲 ࣪₊*
\`\`\`『 ${groupLink} 』\`\`\``;

                console.log(chalk.green(`[ADMIN MONITOR] sending to ${NOTIFY_JID} | mentions: ${JSON.stringify(mentions)}`));
                await sock.sendMessage(NOTIFY_JID, { text: msgText, mentions });
                console.log(chalk.green(`[ADMIN MONITOR] ✅ sent!`));
            }

        } catch (err) {
            console.error(chalk.red("[ADMIN MONITOR ERROR]"), err?.message, err?.stack);
        }
    });

    console.log(chalk.green("✅ [ADMIN MONITOR] registered successfully"));
}

// ── الأمر ─────────────────────────────────────────────────────
export default {
    NovaUltra: {
        command: 'مراقب',
        description: 'يحول القروب الحالي لوجهة إشعارات المشرفين',
        elite: 'on', group: true, prv: false, lock: 'off'
    },

    execute: async ({ sock, msg }) => {
        const chatId = msg.key.remoteJid;

        try {
            const meta = await sock.groupMetadata(chatId);
            const prev = loadGroup();

            fs.writeFileSync(GRP_FILE, JSON.stringify({
                jid:     chatId,
                subject: meta.subject
            }, null, 2), 'utf8');

            const prevNote = prev?.subject && prev.subject !== meta.subject
                ? `\n⛔ تم إلغاء الجروب السابق : *${prev.subject}*`
                : "";

            await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });
            await sock.sendMessage(chatId, {
                text:
`✅ *تم تحديث وجهة إشعارات المشرفين*
┄┄┄┄┄┄┄┄┄┄┄┄┄
📌 القروب : *${meta.subject}*

إشعارات الترقية والإزالة ستُرسل لهنا${prevNote}

> © 𝙰𝚛𝚝`
            }, { quoted: msg });

        } catch (e) {
            await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } });
            await sock.sendMessage(chatId, {
                text: `❌ فشل: ${e?.message}`
            }, { quoted: msg });
        }
    }
};
