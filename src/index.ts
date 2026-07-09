import * as crypto from 'crypto';
import * as http from 'http';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8711869747:AAEZgmkdwa6-Tu6rYXalBx0ypleUGCCwT-o";
const ADMIN_ID = 1880142352;
const CHANNEL_USERNAME = "@affinitysales570";
const BINANCE_KEY = process.env.BINANCE_PAY_API_KEY || "vce0dm45ePlzKZ9AETDjE0G8HqahL7dtPO7lB7GLcZmAMJwwZKKcCmacn2cyJXBg";
const BINANCE_SECRET = process.env.BINANCE_PAY_SECRET || "oATEntQE4k6GtW2F5OF4MkVzDkhfecOwNzbHYD32CRFcJ0f1gSEfpgXRckC6hf7s";

// Advanced Product Schema mapping multiple suppliers
interface UnifiedProduct {
  id: string;
  title: string;
  description: string;
  price_cents: number;
  source: 'manual' | 'lara' | 'ggsoma';
  vendor_product_id?: string;
  is_enabled: boolean;
  stock_count: number;
}

// In-memory operational database arrays
let connectedVendors: string[] = []; 
let globalProducts: UnifiedProduct[] = [
  // Example of manual inventory added by you
  { id: "m1", title: "Affinity Premium AI Tool", description: "Custom Direct Delivery", price_cents: 500, source: "manual", is_enabled: true, stock_count: 50 },
  // Examples of parsed supplier listings
  { id: "l1", title: "Lara Streaming Account", description: "Synced via Lara Conn Code", price_cents: 350, source: "lara", vendor_product_id: "prod_091", is_enabled: true, stock_count: 12 },
  { id: "g1", title: "Ggsoma Gaming Key", description: "Synced via Ggsoma Conn Code", price_cents: 800, source: "ggsoma", vendor_product_id: "key_994", is_enabled: false, stock_count: 0 } // Deselected/Out of stock
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

async function answerCallbackQuery(callbackQueryId: string, text?: string) {
  const payload: any = { callback_query_id: callbackQueryId };
  if (text) payload.text = text;
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/api/webhook') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const update = JSON.parse(body);

        // 1. Text Routing
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

          // Admin panel check
          if (text === "/admin" && userId === ADMIN_ID) {
            await sendTelegramMessage(userId, "🛠️ Admin Control Dashboard:\nManage suppliers, toggle stock inclusion, and add manual entries directly.", [
              [{ text: "📦 View Unified Catalog", callback_data: "admin_catalog" }],
              [{ text: "➕ Add Manual Product", callback_data: "admin_add_manual" }],
              [{ text: "🔑 Connect New Vendor Token", callback_data: "admin_add_vendor" }]
            ]);
            res.writeHead(200); res.end('OK'); return;
          }

          // Standard User Start
          if (text.startsWith("/start")) {
            await sendTelegramMessage(userId, "👋 Welcome to Affinity Sales! Choose an option:", [
              [{ text: "🛒 Products", callback_data: "menu_products" }, { text: "💰 Balance", callback_data: "menu_balance" }],
              [{ text: "👥 Referral", callback_data: "menu_referral" }, { text: "🆘 Support", callback_data: "menu_support" }]
            ]);
          }
        }

        // 2. Intercept Inline Clicks
        if (update.callback_query) {
          const userId = update.callback_query.from.id;
          const data = update.callback_query.data;
          const callbackId = update.callback_query.id;

          await answerCallbackQuery(callbackId);

          // User Menu Routing
          if (data === "menu_products") {
            // Displays only items that are active and marked as enabled by you
            const itemsList = globalProducts
              .filter(p => p.is_enabled && p.stock_count > 0)
              .map((p, idx) => `${idx + 1}. ${p.title} - $${(p.price_cents / 100).toFixed(2)} [Source: ${p.source.toUpperCase()}]`)
              .join('\n');
            await sendTelegramMessage(userId, `🛒 **Affinity Live Storefront**\n\n${itemsList || "No products currently active."}`);
          
          } else if (data === "menu_balance") {
            await sendTelegramMessage(userId, "💰 Your Current Balance: $0.00\n\nTo top up via Binance Pay, use your deposit portal.");
          } else if (data === "menu_referral") {
            await sendTelegramMessage(userId, `👥 Referral System:\n\nEarn $0.04 per valid registration.\n\nYour Link: https://t.me/affinitysales570_bot?start=ref_${userId}`);
          } else if (data === "menu_support") {
            await sendTelegramMessage(userId, "🆘 Assistance Desk: Contact @johnconstantine570");
          
          // Admin Panel Callbacks
          } else if (data === "admin_catalog") {
            // Admin management portal listing toggles
            let adminSummary = "⚙️ **Unified Dynamic Catalog**\nClick product flags in code database or submit toggles:\n\n";
            globalProducts.forEach(p => {
              adminSummary += `${p.is_enabled ? '✅' : '❌'} ${p.title} (${p.source.toUpperCase()}) - Stock: ${p.stock_count}\n`;
            });
            await sendTelegramMessage(userId, adminSummary);
          } else if (data === "admin_add_vendor") {
            await sendTelegramMessage(userId, "📝 Send your encoded connection key payload directly to bind external vendors automatically.");
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
