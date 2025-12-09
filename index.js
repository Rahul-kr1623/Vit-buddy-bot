const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { createClient } = require('@supabase/supabase-js');
const qrcode = require('qrcode-terminal');

// --- 🛠️ SETTINGS ---
const BOT_NAME = 'VIT Buddy 🤖';
const OWNER_NAME = 'Rahul';
const SUPABASE_URL = 'https://wfncmrchltcvgialghrz.supabase.co'; 
const SUPABASE_KEY = 'sb_publishable_uiHDDn-zM1F8qCa5zu3UYQ_AAGjykvp';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function getDayName(offset = 0) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return days[d.getDay()];
}

const messShortcuts = {
    'b1': 'Rassense',
    'b2': 'Mayuri', 'b3': 'Mayuri', 'b4': 'Mayuri', 'b5': 'Mayuri',
    'b6': 'Safal',
    'gb1': 'Dakshin', 'special': 'Dakshin',
    'gb2': 'Mayuri',
    'jmb': 'JMB', 'crcl': 'Rassense',
    'dakshin': 'Dakshin', 'mayuri': 'Mayuri', 'rassense': 'Rassense', 'safal': 'Safal'
};

// --- 📢 DETAILED HELP MESSAGE ---
const HELP_MESSAGE = `📢 *${BOT_NAME} - Student Assistant Bot*
_Created by ${OWNER_NAME}_

Here is the full list of commands you can use:

🏛 *Faculty Commands:*
▸ *!find [name]* Search for a faculty member's cabin and phone number.
   _Ex: !find sanat_

▸ *!faculty [name]* View detailed ratings (Teaching, Grading, Behavior) for a faculty.
   _Ex: !faculty praveen_

🍽 *Mess Menu Commands (Today):*
Get the breakfast, lunch, snacks, and dinner menu instantly:
▸ *!b1* - CRCL Boys Mess
▸ *!b2* - Mayuri Boys Mess (Block 2-5)
▸ *!b6* - Safal Boys Mess
▸ *!gb1* - Dakshin Girls Mess
▸ *!gb2* - Mayuri Girls Mess

🗓 *Weekly Menu Commands:*
Check the menu for any specific day:
▸ *!menu [mess] [day]*
   _Ex: !menu b6 monday_
   _Ex: !menu mayuri tomorrow_

ℹ *Other:*
▸ *!help* - Show this command list again.

_Bot is online 24/7. Just type a command!_
`;

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) qrcode.generate(qr, { small: true });
        
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed. Reconnecting...', shouldReconnect);
            if (shouldReconnect) connectToWhatsApp();
        } else if (connection === 'open') {
            console.log(`✅ ${BOT_NAME} is Online and Listening!`);
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message) return;

        const remoteJid = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        const lowerText = text.toLowerCase().trim();

        // 1. HELP COMMAND
        if (lowerText === '!help') {
            await sock.sendMessage(remoteJid, { text: HELP_MESSAGE });
            return;
        }

        // 2. FACULTY SEARCH
        if (lowerText.startsWith('!find') || lowerText.startsWith('!faculty')) {
            const isRatingSearch = lowerText.startsWith('!faculty');
            const searchQuery = text.split(' ').slice(1).join(' ');
            
            if (!searchQuery) {
                await sock.sendMessage(remoteJid, { text: '❌ Please provide a name. Ex: !find sanat' });
                return;
            }

            const { data, error } = await supabase.from('faculty').select('*').ilike('name', `%${searchQuery}%`);
            
            if (data && data.length > 0) {
                let reply = isRatingSearch ? `📊 *Faculty Ratings*\n\n` : `🔍 *Faculty Contact*\n\n`;
                
                data.forEach(f => {
                    reply += `👨‍🏫 *${f.name}*\n`;
                    reply += `🏠 Cabin: ${f.cabin}\n`;
                    
                    if (isRatingSearch) {
                        reply += `⭐ Teaching: ${f.teaching_rating || 'N/A'}/5\n`;
                        reply += `📝 Grading: ${f.evaluation_rating || 'N/A'}/5\n`;
                        reply += `🤝 Behavior: ${f.behavior_rating || 'N/A'}/5\n`;
                    } else {
                        reply += `📞 Phone: ${f.mobile || 'Not Available'}\n`;
                    }
                    reply += `────────────────\n`;
                });
                await sock.sendMessage(remoteJid, { text: reply });
            } else {
                await sock.sendMessage(remoteJid, { text: `❌ No faculty found for "${searchQuery}"` });
            }
            return;
        }

        // 3. MESS MENU
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

            const { data, error } = await supabase
                .from('mess_menu')
                .select('*')
                .eq('mess_name', searchMess)
                .eq('day', searchDay)
                .single();

            if (data) {
                let reply = `📅 *${data.day}'s Menu* | ${searchMess}\n`;
                if(command.startsWith('b') || command.startsWith('gb')) reply += `📍 Hostel: ${command.toUpperCase()}\n\n`;
                else reply += `\n`;
                
                reply += `🥣 *Breakfast:* ${data.breakfast}\n`;
                reply += `🍛 *Lunch:* ${data.lunch}\n`;
                reply += `☕ *Snacks:* ${data.snacks}\n`;
                reply += `🍲 *Dinner:* ${data.dinner}`;
                
                await sock.sendMessage(remoteJid, { text: reply });
            } else {
                await sock.sendMessage(remoteJid, { text: `❌ Menu not found for ${searchMess} on ${searchDay}.` });
            }
        }
    });
}

connectToWhatsApp();