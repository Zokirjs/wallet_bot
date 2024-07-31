const TelegramBot = require("node-telegram-bot-api");
const stringSimilarity = require("string-similarity");

// Replace with your Telegram bot token
const token = "TOKEN";

// Create a bot instance
const bot = new TelegramBot(token, { polling: true });

// Data storage
let data = [];

// Helper function to parse messages
function parseMessage(msg) {
    const parts = msg.split(" ");
    if (parts.length < 3) return null;

    const owner = parts[0];
    const sumString = parts[1];
    const comment = parts.slice(2, -1).join(" ");
    const purpose = parts[parts.length - 1];

    const sum = parseFloat(sumString.replace(/[^0-9.-]+/g, ""));
    const currency =
        sumString.toLowerCase().includes("usd") || sumString.includes("$")
            ? "USD"
            : "UZS";

    return { owner, sum, currency, purpose, comment };
}

// Listener for messages
bot.on("message", (msg) => {
    const chatId = msg.chat.id;
    const parsedData = parseMessage(msg.text);

    if (!parsedData) {
        bot.sendMessage(
            chatId,
            "Invalid message format. Use: <owner> <sum> <comment> <purpose>",
        );
        return;
    }

    data.push(parsedData);
    bot.sendMessage(
        chatId,
        `Recorded: ${parsedData.owner} ${parsedData.sum} ${parsedData.currency} for ${parsedData.purpose}`,
    );
});

// Calculate totals
bot.onText(/\/total/, (msg) => {
    const chatId = msg.chat.id;
    const totals = data.reduce((acc, item) => {
        const key = `${item.owner}-${item.purpose}`;
        if (!acc[key]) {
            acc[key] = { UZS: 0, USD: 0 };
        }
        acc[key][item.currency] += item.sum;
        return acc;
    }, {});

    let response = "Totals by owner and purpose:\n";
    for (const [key, value] of Object.entries(totals)) {
        response += `${key}: ${value.UZS} UZS, ${value.USD} USD\n`;
    }

    bot.sendMessage(chatId, response);
});

// Clear data
bot.onText(/\/clear/, (msg) => {
    data = [];
    bot.sendMessage(msg.chat.id, "Data cleared.");
});

// Search for similar words in comments
bot.onText(/\/similar/, (msg) => {
    const chatId = msg.chat.id;
    let response = "Similar words in comments:\n";

    for (let i = 0; i < data.length; i++) {
        for (let j = i + 1; j < data.length; j++) {
            const similarity = stringSimilarity.compareTwoStrings(
                data[i].comment,
                data[j].comment,
            );
            if (similarity > 0.5) {
                // Adjust the threshold as needed
                response += `Comments "${data[i].comment}" and "${
                    data[j].comment
                }" are ${Math.round(similarity * 100)}% similar.\n`;
            }
        }
    }

    if (response === "Similar words in comments:\n") {
        response += "No similar comments found.";
    }

    bot.sendMessage(chatId, response);
});

// Filter transactions by comment
bot.onText(/\/filter (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const keyword = match[1].toLowerCase();
    const filteredData = data.filter((item) =>
        item.comment.toLowerCase().includes(keyword),
    );

    let response = `Transactions containing "${keyword}":\n`;
    if (filteredData.length === 0) {
        response += "No transactions found.";
    } else {
        filteredData.forEach((item) => {
            response += `${item.owner} ${item.sum} ${item.currency} for ${item.purpose} (${item.comment})\n`;
        });
    }

    bot.sendMessage(chatId, response);
});
