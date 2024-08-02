const TelegramBot = require("node-telegram-bot-api");
const mongoose = require("mongoose");
const stringSimilarity = require("string-similarity");
require("dotenv").config();

// Replace with your Telegram bot token
const token = process.env.token;

// Replace with your MongoDB connection string
const mongoUri = process.env.mongo_uri;
// Create a bot instance
const bot = new TelegramBot(token, { polling: true });

// Connect to MongoDB
mongoose.connect(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

const db = mongoose.connection;
db.on("error", console.error.bind(console, "MongoDB connection error:"));

// Define a schema and model
const transactionSchema = new mongoose.Schema({
    owner: String,
    sum: Number,
    currency: String,
    purpose: String,
    comment: String,
    createdAt: { type: Date, default: Date.now },
});

const Transaction = mongoose.model("Transaction", transactionSchema);

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
            ? "$"
            : "so'm";

    return { owner, sum, currency, purpose, comment };
}

// Listener for messages
bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const parsedData = parseMessage(msg.text);

    if (!parsedData) {
        bot.sendMessage(
            chatId,
            "Invalid message format. Use: <owner> <sum> <comment> <purpose>",
        );
        return;
    }

    const transaction = new Transaction(parsedData);
    try {
        await transaction.save();
        bot.sendMessage(
            chatId,
            `Recorded: ${parsedData.owner} ${parsedData.sum} ${parsedData.currency} for ${parsedData.purpose}`,
        );
        bot.sendMessage(
            -4238201129,
            `${msg.chat.first_name}: ${parsedData.owner} ${parsedData.sum} ${parsedData.currency} (${parsedData.comment}) for ${parsedData.purpose}`,
        );
    } catch (err) {
        bot.sendMessage(chatId, "Error saving data.");
        console.error(err);
    }
});

// Calculate totals
bot.onText(/\/total/, async (msg) => {
    const chatId = msg.chat.id;

    try {
        const results = await Transaction.aggregate([
            {
                $group: {
                    _id: {
                        owner: "$owner",
                        purpose: "$purpose",
                        currency: "$currency",
                    },
                    totalSum: { $sum: "$sum" },
                },
            },
        ]);

        let response = "Totals by owner and purpose:\n";
        results.forEach((result) => {
            response += `${result._id.owner}-${result._id.purpose}: ${result.totalSum} ${result._id.currency}\n`;
        });

        bot.sendMessage(chatId, response);
    } catch (err) {
        bot.sendMessage(chatId, "Error calculating totals.");
        console.error(err);
    }
});

// Clear data
bot.onText(/\/clear/, async (msg) => {
    try {
        await Transaction.deleteMany({});
        bot.sendMessage(msg.chat.id, "Data cleared.");
    } catch (err) {
        bot.sendMessage(msg.chat.id, "Error clearing data.");
        console.error(err);
    }
});

// Search for similar words in comments
bot.onText(/\/similar/, async (msg) => {
    const chatId = msg.chat.id;

    try {
        const data = await Transaction.find({});
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
    } catch (err) {
        bot.sendMessage(chatId, "Error retrieving data.");
        console.error(err);
    }
});

// Filter transactions by comment
bot.onText(/\/filter (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const keyword = match[1].toLowerCase();

    try {
        const filteredData = await Transaction.find({
            comment: new RegExp(keyword, "i"),
        });

        let response = `Transactions containing "${keyword}":\n`;
        let totalSumUSD = 0;
        let totalSumUZS = 0;
        if (filteredData.length === 0) {
            response += "No transactions found.";
        } else {
            filteredData.forEach((item) => {
                if (item.currency === "$") {
                    totalSumUSD += item.sum;
                } else {
                    totalSumUZS += item.sum;
                }
                response += `${item.owner} ${item.sum} ${item.currency} for ${item.purpose} (${item.comment})\n`;
            });
        }

        response =
            `Total Sum: ${totalSumUZS} so'm, ${totalSumUSD} $\n` + response;
        bot.sendMessage(chatId, response);
    } catch (err) {
        bot.sendMessage(chatId, "Error retrieving data.");
        console.error(err);
    }
});
