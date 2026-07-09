import * as crypto from 'crypto';
import * as http from 'http';

// 1. Core Environmental Variables Mapping
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8711869747:AAEZgmkdwa6-Tu6rYXalBx0ypleUGCCwT-o";
const ADMIN_ID = 1880142352;
const CHANNEL_USERNAME = "@affinitysales570";

// Decoded connection criteria from Lara's exact payload string
const API_KEY = "sk_cbfaf6681310bbe88883323ce4184be5097706c12857d7";
const API_URL = "https://ins2112131.onrender.com/8f71aedd3494e042bb06408f50b7f938";

interface VendorProduct {
  id: string;
  name_ar: string;
  name_en: string;
  desc_en: string;
  your_price: number;
  stock: number | string;
  is_manual: boolean;
}

// Local runtime variables array
let currentCachedProducts: VendorProduct[] = [];

// 2. Lara Endpoint Request Interceptor
async function fetchRemoteProducts(): Promise<VendorProduct[]> {
  try {
    const response = await fetch(`${API_URL}/products`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) return [];
    const payload: any = await response.json();
    
    if (payload.success && Array.isArray(payload.products)) {
      currentCachedProducts = payload.products;
      return payload.products;
    }
    return [];
  } catch (error) {
    console.error("Lara network endpoint tracking issue:", error);
    return currentCachedProducts; // Return cached snapshot on failure
  }
}

// Initial Sync
fetchRemoteProducts();

// 3. Telegram Core Communication Methods
async function checkChannelMembership(userId: number): Promise<boolean> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getChatMember?chat_id=${CHANNEL_USERNAME}&user_id=${userId}`);
    const data: any = await response.json();
    return data.ok && ['creator', 'administrator', 'member'].includes(data.result.status);
  } catch {
    return false;
  }
}

async function sendTelegramMessage(chatId: number, text: string, inlineKeyboard?: any) {
  const payload: any = { chat_id: chatId, text: text, parse_mode: "HTML" }; // Match HTML spec requirement
  if (inlineKeyboard) payload.reply_markup = { inline_keyboard: inlineKeyboard };
  
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

async function answerCallbackQuery(callbackQueryId: string) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId })
  });
}

// 4. Public Port Routing Engine (Webhook Receiver)
const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/api/webhook') {
    let buffer = '';
    req.on('data', chunk => { buffer += chunk; });
    req.on('end', async () => {
      try {
        const update = JSON.parse(buffer);

        // A. Handle Regular Core Text Actions
        if (update.message) {
          const userId = update.message.from.id;
          const text = update.message.text || "";

          // Channel Membership Gate Verification Check
          if (!(await checkChannelMembership(userId))) {
            await sendTelegramMessage(userId, "⚠️ <b>Access Locked!</b>\nYou must join our official updates channel before browsing our digital services.", [
              [{ text: "📢 Join Channel", url: "https://t.me/affinitysales570" }],
              [{ text: "✅ Verified / Check Status", callback_data: "verify_join" }]
            ]);
            res.writeHead(200); res.end('OK'); return;
          }

          if (text === "/sync" && userId === ADMIN_ID) {
            await fetchRemoteProducts();
            await sendTelegramMessage(ADMIN_ID, "🔄 <b>Cache Synchronized!</b> Live product array pulled successfully from remote endpoint.");
            res.writeHead(200); res.end('OK'); return;
          }

          if (text.startsWith("/start")) {
            await sendTelegramMessage(userId, "👋 <b>Welcome to Affinity Sales Storefront!</b>\nSelect an option below to explore our services:", [
              [{ text: "🛒 Products", callback_data: "store_products" }, { text: "💰 My Balance", callback_data: "store_balance" }]
            ]);
          }
        }

        // B. Handle Button Interactive Clicking Data Flow
        if (update.callback_query) {
          const userId = update.callback_query.from.id;
          const callbackData = update.callback_query.data;
          await answerCallbackQuery(update.callback_query.id);

          if (callbackData === "store_products") {
            const liveItems = await fetchRemoteProducts();
            
            if (liveItems.length === 0) {
              await sendTelegramMessage(userId, "🛒 <b>Affinity Catalog</b>\n\nNo active products found inside the network catalog right now.");
              res.writeHead(200); res.end('OK'); return;
            }

            // Maps out items with their explicit delivery type icons (⚡ or 🤝) as requested
            const keyboardButtons = liveItems.map((item) => {
              const deliveryIcon = item.is_manual ? "🤝 Manual" : "⚡ Instant";
              return [{
                text: `${item.name_en} - $${item.your_price.toFixed(2)} (${deliveryIcon})`,
                callback_data: `view_prod_${item.id}`
              }];
            });

            await sendTelegramMessage(userId, "🛍️ <b>Affinity Active Storefront</b>\nSelect a product to view detailed descriptions and stock balances:", keyboardButtons);
          
          } else if (callbackData.startsWith("view_prod_")) {
            const productId = callbackData.replace("view_prod_", "");
            const selectedItem = currentCachedProducts.find(p => p.id === productId);

            if (selectedItem) {
              const deliveryType = selectedItem.is_manual ? "🤝 Manual Delivery" : "⚡ Instant Delivery";
              const infoText = `📦 <b>${selectedItem.name_en}</b>\n\n` +
                               `📝 <i>${selectedItem.desc_en}</i>\n\n` +
                               `💵 <b>Price:</b> $${selectedItem.your_price.toFixed(2)}\n` +
                               `📊 <b>Stock Status:</b> ${selectedItem.stock}\n` +
                               `🚚 <b>Type:</b> ${deliveryType}`;

              await sendTelegramMessage(userId, infoText, [
                [{ text: "💳 Buy Now", callback_data: `buy_item_${selectedItem.id}` }],
                [{ text: "🔙 Return to Catalog", callback_data: "store_products" }]
              ]);
            }
          
          } else if (callbackData.startsWith("buy_item_")) {
            const productId = callbackData.replace("buy_item_", "");
            const itemToBuy = currentCachedProducts.find(p => p.id === productId);

            if (itemToBuy) {
              // Send order request using Lara's exact purchase schema criteria mapping
              const buyResponse = await fetch(`${API_URL}/purchase`, {
                method: "POST",
                headers: {
                  "Authorization": `Bearer ${API_KEY}`,
                  "Content-Type": "application/json"
                },
                body: JSON.stringify({
                  product_id: productId,
                  qty: 1,
                  buyer_info: `@User_${userId}`
                })
              });

              const purchaseResult: any = await buyResponse.json();

              if (purchaseResult.success) {
                if (itemToBuy.is_manual) {
                  await sendTelegramMessage(userId, "✅ <b>Order Received!</b> Delivery within minutes.");
                } else if (purchaseResult.codes && purchaseResult.codes.length > 0) {
                  const codesList = purchaseResult.codes.join("\n");
                  await sendTelegramMessage(userId, `🎉 <b>Purchase Complete!</b>\n\n🔑 <b>Your Digital Key/Code:</b>\n<code>${codesList}</code>`);
                }
                
                // Notify Owner/Admin securely about the sale
                await sendTelegramMessage(ADMIN_ID, `🔔 <b>New Order Logged:</b>\nProduct ID: ${productId}\nBuyer ID: ${userId}\nStatus: ${purchaseResult.status}`);
              } else {
                const faultReason = purchaseResult.error || "Transaction declined by vendor framework.";
                await sendTelegramMessage(userId, `❌ <b>Order Failed:</b> ${faultReason}`);
              }
            }
          
          } else if (callbackData === "store_balance") {
            // Hit Lara's explicit /balance request endpoint
            const balResponse = await fetch(`${API_URL}/balance`, {
              headers: { "Authorization": `Bearer ${API_KEY}` }
            });
            const balData: any = await balResponse.json();
            const walletBalance = balData.balance || "0.00";

            await sendTelegramMessage(userId, `💰 <b>Your Affinity Wallet Balance</b>\n\n🔹 Current Balance: <b>$${walletBalance} USDT</b>\n\nTop ups are automatically credited via the gateway system.`);
          
          } else if (callbackData === "verify_join") {
            if (await checkChannelMembership(userId)) {
              await sendTelegramMessage(userId, "✅ <b>Verification Successful!</b> Access granted. Send /start to display your primary storefront layout.");
            } else {
              await sendTelegramMessage(userId, "❌ <b>Verification Failed.</b> You still haven't joined the updates channel.");
            }
          }
        }
      } catch (err) {
        console.error("Webhook processing tracking alert:", err);
      }
      res.writeHead(200); res.end('OK');
    });
  } else {
    res.writeHead(200); res.end('Affinity Live Node Backend Protocol Online');
  }
});

server.listen(process.env.PORT || 3000);
