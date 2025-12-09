const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, delay } = require('@whiskeysockets/baileys');
const { createClient } = require('@supabase/supabase-js');
const express = require('express');
const app = express();

// --- SETTINGS ---
const BOT_NAME = 'VIT Buddy 🤖';
const SUPABASE_URL = 'https://wfncmrchltcvgialghrz.supabase.co'; 
const SUPABASE_KEY = 'sb_publishable_uiHDDn-zM1F8qCa5zu3UYQ_AAGjykvp';

// Ye number Render ki settings se aayega
const MY_PHONE_NUMBER = process.env.PHONE_NUMBER; 

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- KEEPER ALIVE (Render ke liye zaroori) ---
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => { res.send('Bot is Running! 🚀'); });
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

🏛 *Faculty Search:*
▸ *!find [name]* - Contact Info
▸ *!faculty [name]* - Ratings

🍽 *Mess Menu:*
▸ *!b1, !b2, !b6, !gb1, !gb2*

🗓 *Weekly:*
▸ *!menu [mess] [day]*

ℹ *!help* - Commands`;

// --- MAIN LOGIC ---
async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false, // QR Code band
        logger: require('pino')({ level: 'silent' }),
        browser: ["Ubuntu", "Chrome", "20.0.04"], // Linux browser dikhayenge
    });

    // --- PAIRING CODE LOGIC ---
    if (!sock.authState.creds.registered) {
        console.log("Waiting for pairing code...");
        
        // Agar Render settings mein number diya hai
        if (MY_PHONE_NUMBER) {
            setTimeout(async () => {
                try {
                    // Code generate karo
                    const code = await sock.requestPairingCode(MY_PHONE_NUMBER);
                    console.log(`\n\n👉 YOUR PAIRING CODE: ${code}\n\n`);
                } catch (err) {
                    console.log("Error requesting pairing code: ", err);
                }
            }, 4000);
        } else {
            console.log("❌ PHONE_NUMBER environment variable missing on Render!");
        }
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed. Reconnecting...', shouldReconnect);
            if (shouldReconnect) connectToWhatsApp();
        } else if (connection === 'open') {
            console.log(`✅ ${BOT_NAME} is Connected & Online!`);
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message) return;

        const remoteJid = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        const lowerText = text.toLowerCase().trim();

        if (lowerText === '!help') {
            await sock.sendMessage(remoteJid, { text: HELP_MESSAGE });
            return;
        }

        if (lowerText.startsWith('!find') || lowerText.startsWith('!faculty')) {
            const isRatingSearch = lowerText.startsWith('!faculty');
            const searchQuery = text.split(' ').slice(1).join(' ');
            if (!searchQuery) {
                await sock.sendMessage(remoteJid, { text: '❌ Provide a name.' });
                return;
            }
            const { data } = await supabase.from('faculty').select('*').ilike('name', `%${searchQuery}%`);
            
            if (data && data.length > 0) {
                let reply = isRatingSearch ? `📊 *Ratings*\n\n` : `🔍 *Contact*\n\n`;
                data.forEach(f => {
                    reply += `👨‍🏫 *${f.name}*\n🏠 ${f.cabin}\n`;
                    if (isRatingSearch) {
                        reply += `⭐ Teach: ${f.teaching_rating || 'N/A'}\n📝 Grade: ${f.evaluation_rating || 'N/A'}\n`;
                    } else {
                        reply += `📞 ${f.mobile || 'NA'}\n`;
                    }
                    reply += `────────────────\n`;
                });
                await sock.sendMessage(remoteJid, { text: reply });
            } else {
                await sock.sendMessage(remoteJid, { text: `❌ Not found.` });
            }
            return;
        }

        const command = lowerText.split(' ')[0].replace('!', ''); 
        const isMenuCommand = lowerText.startsWith('!menu') || messShortcuts[command];

        if (isMenuCommand) {
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
                let reply = `📅 *${data.day}* | ${searchMess}\n`;
                if(command.startsWith('b') || command.startsWith('gb')) reply += `📍 ${command.toUpperCase()}\n\n`; else reply += `\n`;
                reply += `🥣 B: ${data.breakfast}\n🍛 L: ${data.lunch}\n☕ S: ${data.snacks}\n🍲 D: ${data.dinner}`;
                await sock.sendMessage(remoteJid, { text: reply });
            } else {
                await sock.sendMessage(remoteJid, { text: `❌ No menu found.` });
            }
        }
    });
}

connectToWhatsApp();