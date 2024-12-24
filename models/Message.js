const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    content: {
        type: String,
        required: true
    },
    authorId: {
        type: String,
        required: true
    },
    authorUsername: {
        type: String,
        required: true
    },
    channelId: {
        type: String,
        required: true
    },
    channelName: {
        type: String,
        required: true
    },
    serverId: {
        type: String,
        required: true
    },
    serverName: {
        type: String,
        required: true
    },
    messageId: {
        type: String,
        required: false
    },
    isBot: {
        type: Boolean,
        default: false
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Message', messageSchema);
