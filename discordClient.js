const { Client, GatewayIntentBits } = require('discord.js');
const Message = require('./models/Message');

// Initialize Discord client
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.once('ready', () => {
    console.log(`Discord bot logged in as ${client.user.tag}`);
});

client.on('messageCreate', async message => {
    // Only store messages from regular users (not bots)
    if (!message.author.bot) {
        try {
            const newMessage = new Message({
                content: message.content,
                authorId: message.author.id,
                authorUsername: message.author.username,
                channelId: message.channel.id,
                channelName: message.channel.name,
                serverId: message.guild.id,
                serverName: message.guild.name,
                messageId: message.id,
                isBot: false
            });
            await newMessage.save();
        } catch (error) {
            console.error('Error saving message to database:', error);
        }
    }

    // Ignore bot messages for command processing
    if (message.author.bot) return;

    // Command to send a message to a specific channel
    if (message.content.startsWith('!send')) {
        const args = message.content.split(' ');
        // Format: !send #channel-name message
        if (args.length < 3) {
            return message.reply('Please use the format: !send #channel-name your message');
        }

        const channelMention = args[1];
        const channelId = channelMention.replace(/[<#>]/g, '');
        const messageContent = args.slice(2).join(' ');

        try {
            const channel = await client.channels.fetch(channelId);
            await channel.send(messageContent);
            message.reply('Message sent successfully!');
        } catch (error) {
            message.reply('Failed to send message. Make sure the channel exists and I have permission to send messages there.');
        }
    }
});

module.exports = client;
