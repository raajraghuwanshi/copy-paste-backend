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

// Store the latest content for each room in memory
// In a production app, you'd use Redis or a Database
const roomStates = {};


io.on('connect', (socket) => {
    socket.on('join', (roomId) => {
        socket.join(roomId);

        // If the room already has data, send it to the person who just joined
        if (roomStates[roomId]) {
            socket.emit('message', { message: roomStates[roomId] });
        }
    });

    socket.on('send', ({ roomId, message }) => {
        // Update the global state for this room
        roomStates[roomId] = message;
        // Sync to everyone else
        socket.to(roomId).emit('message', { message });
    });


    socket.on('disconnect', () => {
        console.log('User disconnected')
    })
});

app.get('/ping',(req,res)=>{
    return res.status(200).send('i am awake');
})


httpServer.listen(4000, () => {
    console.log('Server is running on port 4000')
})