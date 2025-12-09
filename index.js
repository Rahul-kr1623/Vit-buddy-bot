const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, delay } = require('@whiskeysockets/baileys');
const { createClient } = require('@supabase/supabase-js');
const express = require('express');
const app = express();

// --- 🛠️ SETTINGS ---
const BOT_NAME = 'VIT Nexus 🤖';
const OWNER_NAME = 'Rahul';
const WEBSITE_LINK = 'https://vitnexus.vercel.app'; // Tumhari Website ka Link
const SUPABASE_URL = 'https://wfncmrchltcvgialghrz.supabase.co'; 
const SUPABASE_KEY = 'sb_publishable_uiHDDn-zM1F8qCa5zu3UYQ_AAGjykvp';

const MY_PHONE_NUMBER = process.env.PHONE_NUMBER; 

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- KEEPER ALIVE ---
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => { res.send('VIT Nexus Bot is Running! 🚀'); });
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// --- HELPER FUNCTIONS ---
function getDayName(offset = 0) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return days[d.getDay()];
}

const messShortcuts = {
    'b1': 'Rassense', 'crcl': 'Rassense',
    'b2': 'Mayuri', 'b3': 'Mayuri', 'b4': 'Mayuri', 'b5': 'Mayuri', 'mayuri': 'Mayuri',
    'b6': 'Safal', 'safal': 'Safal',
    'gb1': 'Dakshin', 'special': 'Dakshin', 'dakshin': 'Dakshin',
    'gb2': 'Mayuri', 'jmb': 'JMB', 'rassense': 'Rassense'
};

const HELP_MESSAGE = `📢 *${BOT_NAME}*
_Created by ${OWNER_NAME}_

📘 *Available Commands:*

🏛 *Faculty Search:*
▸ *!find [name]* OR *![name]*
   Get Cabin & Contact info.
   _Ex: !find sanat_ or just _!sanat_

▸ *!faculty [name]*
   Get detailed ratings & reviews.
   _Ex: !faculty praveen_

🍽 *Mess Menu (Today):*
▸ *!b1* - CRCL Boys
▸ *!b2* - Mayuri Boys
▸ *!b6* - Safal Boys
▸ *!gb1* - Dakshin Girls
▸ *!gb2* - Mayuri Girls

🗓 *Weekly Menu:*
▸ *!menu [mess] [day]*
   _Ex: !menu b6 friday_

ℹ *!help* - Show this menu.
`;

// --- MAIN LOGIC ---
async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: require('pino')({ level: 'silent' }),
        browser: ["Ubuntu", "Chrome", "20.0.04"],
    });

    if (!sock.authState.creds.registered) {
        console.log("Waiting for pairing code...");
        if (MY_PHONE_NUMBER) {
            setTimeout(async () => {
                try {
                    const code = await sock.requestPairingCode(MY_PHONE_NUMBER);
                    console.log(`\n\n👉 YOUR PAIRING CODE: ${code}\n\n`);
                } catch (err) {
                    console.log("Error requesting pairing code: ", err);
                }
            }, 4000);
        } else {
            console.log("❌ PHONE_NUMBER variable missing!");
        }
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Reconnecting...', shouldReconnect);
            if (shouldReconnect) connectToWhatsApp();
        } else if (connection === 'open') {
            console.log(`✅ ${BOT_NAME} is Online!`);
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message) return;

        const remoteJid = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        const lowerText = text.toLowerCase().trim();

        if (!lowerText.startsWith('!')) return; // Ignore non-commands

        const commandRaw = lowerText.split(' ')[0]; 
        const command = commandRaw.replace('!', ''); 

        // 1. HELP
        if (command === 'help') {
            await sock.sendMessage(remoteJid, { text: HELP_MESSAGE });
            return;
        }

        // 2. MESS MENU COMMANDS
        if (command === 'menu' || messShortcuts[command]) {
            const parts = lowerText.split(' ');
            let searchMess = 'Rassense'; 
            let searchDay = getDayName(0); 

            if (messShortcuts[command]) searchMess = messShortcuts[command];

            const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
            parts.forEach(p => {
                if (days.includes(p)) searchDay = p.charAt(0).toUpperCase() + p.slice(1);
                if (p === 'today') searchDay = getDayName(0);
                if (p === 'tomorrow') searchDay = getDayName(1);
                if (messShortcuts[p]) searchMess = messShortcuts[p];
            });

            const { data } = await supabase.from('mess_menu').select('*').eq('mess_name', searchMess).eq('day', searchDay).single();

            if (data) {
                let reply = `🍽 *${data.mess_name} Menu (${data.day})*\n`;
                if(command.startsWith('b') || command.startsWith('gb')) reply += `📍 Hostel: ${command.toUpperCase()}\n\n`; else reply += `\n\n`;
                reply += `🥣 *Breakfast:* ${data.breakfast}\n\n`;
                reply += `🍛 *Lunch:* ${data.lunch}\n\n`;
                reply += `☕ *Snacks:* ${data.snacks}\n\n`;
                reply += `🍲 *Dinner:* ${data.dinner}`;
                await sock.sendMessage(remoteJid, { text: reply });
            } else {
                await sock.sendMessage(remoteJid, { text: `❌ Menu not found.` });
            }
            return;
        }

        // 3. FACULTY SEARCH (Detailed Format)
        let isRatingSearch = false;
        let searchQuery = '';

        if (command === 'faculty') {
            isRatingSearch = true;
            searchQuery = text.split(' ').slice(1).join(' ');
        } else if (command === 'find') {
            searchQuery = text.split(' ').slice(1).join(' ');
        } else {
            // Direct name search (!sanat)
            searchQuery = text.replace('!', '').trim();
        }

        if (!searchQuery) {
            await sock.sendMessage(remoteJid, { text: '❌ Please provide a name.' });
            return;
        }

        const { data } = await supabase.from('faculty').select('*').ilike('name', `%${searchQuery}%`);
        
        if (data && data.length > 0) {
            // HEADER
            let reply = isRatingSearch ? `📊 *Faculty Rating Results*\n` : `🔍 *Faculty Contact Results*\n`;
            reply += `\n🔍 Search: "${searchQuery}"\n`;
            reply += `📊 Found ${data.length} matching faculty\n`;
            reply += `━━━━━━━━━━━━━━━━━━━━\n\n`;

            // BODY
            data.forEach(f => {
                reply += `🔍  *${f.name}*\n`;
                reply += `📍 Cabin: ${f.cabin}\n`;
                
                if (isRatingSearch) {
                    reply += `⭐ Teaching: ${f.teaching_rating || 'N/A'}/5\n`;
                    reply += `📝 Grading: ${f.evaluation_rating || 'N/A'}/5\n`;
                    reply += `🤝 Behavior: ${f.behavior_rating || 'N/A'}/5\n`;
                } else {
                    reply += `📞 Contact: ${f.mobile || 'Not Available'}\n`;
                }
                // Website Link
                reply += `📝 Rate Here: ${WEBSITE_LINK}\n`;
                reply += `━━━━━━━━━━━━━━━━━━━━\n\n`;
            });

            await sock.sendMessage(remoteJid, { text: reply });
        } else {
            await sock.sendMessage(remoteJid, { text: `❌ No faculty found matching "${searchQuery}"` });
        }
    });
}

connectToWhatsApp();