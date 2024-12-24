const client = require('./discordClient');
const dotenv = require('dotenv');
dotenv.config();

client.login(process.env.DISCORD_TOKEN);
