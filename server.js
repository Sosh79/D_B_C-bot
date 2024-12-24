const express = require('express');
const mongoose = require('mongoose');
const Message = require('./models/Message');
const path = require('path');
const client = require('./discordClient');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

// Login Discord bot
client.login(process.env.DISCORD_TOKEN);

client.once('ready', () => {
    console.log(`Discord bot logged in as ${client.user.tag}`);
});

client.on('messageCreate', async message => {
    try {
        if (message.author.bot) return;
        
        console.log('Received message:', message.content); // Debug log

        const newMessage = new Message({
            content: message.content,
            authorId: message.author.id,
            authorUsername: message.author.username,
            channelId: message.channel.id,
            channelName: message.channel.name,
            serverId: message.guild.id,
            serverName: message.guild.name,
            messageId: message.id,
            isBot: message.author.bot
        });

        const savedMessage = await newMessage.save();
        console.log('Message saved successfully:', savedMessage); // Debug log
    } catch (error) {
        console.error('Error saving message:', error);
    }
});

// Set EJS as templating engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Routes
app.get('/', async (req, res) => {
    try {
        // Get unique servers with their IDs and names
        const servers = await Message.aggregate([
            {
                $group: {
                    _id: '$serverId',
                    serverName: { $first: '$serverName' }
                }
            }
        ]);
        res.render('index', { servers });
    } catch (error) {
        console.error('Error fetching servers:', error);
        res.status(500).send('Error fetching servers');
    }
});

app.get('/server/:serverId', async (req, res) => {
    try {
        const serverId = req.params.serverId;
        
        // Get unique channels for this server with their IDs and names
        const channels = await Message.aggregate([
            { $match: { serverId: serverId } },
            {
                $group: {
                    _id: '$channelId',
                    channelName: { $first: '$channelName' }
                }
            }
        ]);

        const serverName = (await Message.findOne({ serverId }))?.serverName || 'Unknown Server';
        res.render('server', { channels, serverId, serverName });
    } catch (error) {
        console.error('Error fetching channels:', error);
        res.status(500).send('Error fetching channels');
    }
});

app.get('/messages/:serverId/:channelId', async (req, res) => {
    try {
        const { serverId, channelId } = req.params;
        const messages = await Message.find({ serverId, channelId })
            .sort({ timestamp: -1 })
            .limit(100);

        if (messages.length === 0) {
            return res.render('messages', { 
                messages: [], 
                channelName: 'Unknown Channel',
                serverName: 'Unknown Server',
                serverId,
                channelId
            });
        }

        const channelName = messages[0].channelName;
        const serverName = messages[0].serverName;
        res.render('messages', { 
            messages, 
            channelName, 
            serverName,
            serverId,
            channelId
        });
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).send('Error fetching messages');
    }
});

// Route to show all servers and channels where the bot is present
app.get('/bot-servers', async (req, res) => {
    try {
        const servers = client.guilds.cache.map(guild => {
            const channels = guild.channels.cache
                .map(channel => ({
                    id: channel.id,
                    name: channel.name,
                    type: channel.type,
                    position: channel.position,
                    parentId: channel.parentId
                }))
                .sort((a, b) => {
                    // First sort by parent (category)
                    if (a.parentId !== b.parentId) {
                        if (!a.parentId) return -1;
                        if (!b.parentId) return 1;
                        return a.parentId.localeCompare(b.parentId);
                    }
                    // Then by position
                    return a.position - b.position;
                });

            return {
                id: guild.id,
                name: guild.name,
                icon: guild.iconURL(),
                channels: channels
            };
        });

        res.render('bot-servers', { 
            servers,
            channelTypes: {
                GUILD_TEXT: 0,
                GUILD_VOICE: 2,
                GUILD_CATEGORY: 4,
                GUILD_ANNOUNCEMENT: 5,
                GUILD_STAGE_VOICE: 13,
                GUILD_FORUM: 15
            }
        });
    } catch (error) {
        console.error('Error fetching servers:', error);
        res.status(500).send('Error fetching servers');
    }
});

// API endpoint to send message
app.post('/api/send-message', async (req, res) => {
    try {
        const { serverId, channelId, message } = req.body;

        if (!serverId || !channelId || !message) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const channel = await client.channels.fetch(channelId);
        if (!channel) {
            return res.status(404).json({ error: 'Channel not found' });
        }

        const sentMessage = await channel.send(message);
        // Store the message ID in the database
        const newMessage = new Message({
            content: message,
            authorId: client.user.id,
            authorUsername: client.user.username,
            channelId,
            channelName: channel.name,
            serverId,
            serverName: channel.guild.name,
            messageId: sentMessage.id, // Store Discord message ID
            isBot: true
        });
        await newMessage.save();

        res.json({ 
            success: true, 
            message: 'Message sent successfully',
            messageId: sentMessage.id
        });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

// API endpoint to delete message
app.delete('/api/delete-message', async (req, res) => {
    try {
        const { channelId, messageId } = req.body;

        if (!channelId || !messageId) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const channel = await client.channels.fetch(channelId);
        if (!channel) {
            return res.status(404).json({ error: 'Channel not found' });
        }

        const message = await channel.messages.fetch(messageId);
        if (!message) {
            return res.status(404).json({ error: 'Message not found' });
        }

        // Delete the message regardless of who sent it
        await message.delete();
        // Delete from database
        await Message.deleteOne({ messageId });

        res.json({ success: true, message: 'Message deleted successfully' });
    } catch (error) {
        console.error('Error deleting message:', error);
        if (error.code === 50013) {
            res.status(403).json({ error: 'Bot does not have permission to delete this message' });
        } else {
            res.status(500).json({ error: 'Failed to delete message' });
        }
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Web server running on port ${PORT}`);
});
