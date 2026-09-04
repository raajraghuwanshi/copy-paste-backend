import dotenv from 'dotenv'
dotenv.config()
import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'

const app = express()
const httpServer = createServer(app)

const io = new Server(httpServer, {
    cors: {
        origin: process.env.FRONTEND_URI, // Ensure this matches your Next.js URL
        methods: ["GET", "POST"],
        credentials: true
    }
})

// Store the latest content and state for each room in memory
// roomStates[roomId] = { content: string, locked: boolean, creatorId: string, members: Set<string> }
const roomStates = {};

io.on('connect', (socket) => {
    socket.on('join', (roomId) => {
        if (!roomId) return;

        // Initialize room state if it doesn't exist
        if (!roomStates[roomId]) {
            roomStates[roomId] = {
                content: '',
                locked: false,
                creatorId: socket.id,
                members: new Set([socket.id])
            };
        }

        const room = roomStates[roomId];

        // Check if room is locked and user is not already a member or creator
        const isMember = room.members.has(socket.id);
        const isCreator = room.creatorId === socket.id;

        if (room.locked && !isMember && !isCreator) {
            socket.emit('room:join-denied', {
                reason: 'Room #' + roomId + ' is locked by the owner.'
            });
            return;
        }

        // Add socket to room members and join Socket.IO room
        room.members.add(socket.id);
        socket.join(roomId);

        // Send initial room state to joining client
        socket.emit('room:state', {
            roomId,
            content: room.content,
            locked: room.locked,
            isCreator: socket.id === room.creatorId
        });

        // If the room already has content, send it to the person who just joined
        if (room.content) {
            socket.emit('message', { message: room.content, senderId: 'SERVER' });
        }
    });

    socket.on('room:toggle-lock', ({ roomId }) => {
        const room = roomStates[roomId];
        if (room && room.creatorId === socket.id) {
            room.locked = !room.locked;
            io.to(roomId).emit('room:lock-status', { locked: room.locked });
        }
    });

    socket.on('send', ({ roomId, message, senderId }) => {
        if (!roomId) return;
        if (!roomStates[roomId]) {
            roomStates[roomId] = {
                content: message,
                locked: false,
                creatorId: socket.id,
                members: new Set([socket.id])
            };
        } else {
            roomStates[roomId].content = message;
        }
        
        // Sync to everyone else in the room (tagging senderId)
        socket.to(roomId).emit('message', { 
            message, 
            senderId: senderId || socket.id 
        });
    });

    socket.on('typing:start', ({ roomId }) => {
        if (roomId) {
            socket.to(roomId).emit('typing:status', { isTyping: true, senderId: socket.id });
        }
    });

    socket.on('typing:stop', ({ roomId }) => {
        if (roomId) {
            socket.to(roomId).emit('typing:status', { isTyping: false, senderId: socket.id });
        }
    });

    socket.on('disconnect', () => {
        // Clean up socket from room members
        for (const roomId in roomStates) {
            if (roomStates[roomId].members.has(socket.id)) {
                roomStates[roomId].members.delete(socket.id);
            }
        }
        console.log('User disconnected:', socket.id);
    });
});

app.get('/ping', (req, res) => {
    return res.status(200).send('i am awake');
});

httpServer.listen(4000, () => {
    console.log('Server is running on port 4000');
});