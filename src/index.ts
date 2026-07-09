import * as crypto from 'crypto';
// Note: Node 18+ has native fetch, using global fetch here

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8711869747:AAEZgmkdwa6-Tu6rYXalBx0ypleUGCCwT-o";
const ADMIN_ID = 1880142352;
const CHANNEL_USERNAME = "@affinitysales570";
const BINANCE_KEY = process.env.BINANCE_PAY_API_KEY || "vce0dm45ePlzKZ9AETDjE0G8HqahL7dtPO7lB7GLcZmAMJwwZKKcCmacn2cyJXBg";
const BINANCE_SECRET = process.env.BINANCE_PAY_SECRET || "oATEntQE4k6GtW2F5OF4MkVzDkhfecOwNzbHYD32CRFcJ0f1gSEfpgXRckC6hf7s";

// Mock Database arrays to keep it fast and simple
let usersDb: any[] = [];
let productsDb: any[] = [
  { id: "1", title: "Premium AI Tool", description: "1 Month Access", price_cents: 500, source: "manual", is_enabled: true }
];

async function checkChannelMembership(userId: number): Promise<boolean> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getChatMember?chat_id=${CHANNEL_USERNAME}&user_id=${userId}`);
    const data: any = await response.json();
    if (!data.ok) return false;
    return ['creator', 'administrator', 'member'].includes(data.result.status);
  } catch {
    return false;
  }
}

async function sendTelegramMessage(chatId: number, text: string, inlineKeyboard?: any) {
  const payload: any = { chat_id: chatId, text: text };
  if (inlineKeyboard) payload.reply_markup = { inline_keyboard: inlineKeyboard };
  
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

// Render server layout to listen to webhooks
import * as http from 'http';

const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/api/webhook') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const update = JSON.parse(body);
        if (update.message) {
          const userId = update.message.from.id;
          const text = update.message.text || "";

          const hasJoined = await checkChannelMembership(userId);
          if (!hasJoined) {
            await sendTelegramMessage(userId, "⚠️ You must join our channel before using this bot!", [
              [{ text: "📢 Join Channel", url: "https://t.me/affinitysales570" }],
              [{ text: "✅ Verified / Check Status", callback_data: "verify_join" }]
            ]);
            res.writeHead(200); res.end('OK'); return;
          }

          if (text === "/admin" && userId === ADMIN_ID) {
            await sendTelegramMessage(userId, "🛠️ Admin Control Panel:", [
              [{ text: "🛒 Products", callback_data: "admin_prod" }, { text: "🔗 Sync Reseller", callback_data: "admin_sync" }]
            ]);
            res.writeHead(200); res.end('OK'); return;
          }

          if (text.startsWith("/start")) {
            await sendTelegramMessage(userId, "👋 Welcome to Affinity Sales! Choose an option:", [
              [{ text: "🛒 Products", callback_data: "menu_products" }, { text: "💰 Balance", callback_data: "menu_balance" }],
              [{ text: "👥 Referral", callback_data: "menu_referral" }, { text: "🆘 Support", callback_data: "menu_support" }]
            ]);
          }
        }
      } catch (e) { console.error(e); }
      res.writeHead(200); res.end('OK');
    });
  } else {
    res.writeHead(200); res.end('Bot Running 24/7');
  }
});

server.listen(process.env.PORT || 3000, () => {
  console.log("Server listening...");
});
