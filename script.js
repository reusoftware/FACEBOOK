document.addEventListener('DOMContentLoaded', () => {
    let socket;
    let isConnected = false;
    let reconnectInterval = 5000;
    let reconnectTimeout;
    let currentUsername = '';

    const loginButton = document.getElementById('loginButton');
    const statusDiv = document.getElementById('status');
    const roomListbox = document.getElementById('roomListbox');
    const debugBox = document.getElementById('debugBox');
    const loginForm = document.getElementById('loginForm');
    const mainContent = document.getElementById('mainContent');
    const tabButtonsContainer = document.getElementById('tabButtonsContainer');
    const tabsContainer = document.getElementById('tabsContainer');
    const friendListbox = document.getElementById('friendListbox');

    loginButton.addEventListener('click', async () => {
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        currentUsername = username;
        await connectWebSocket(username, password);
    });

    async function connectWebSocket(username, password) {
        statusDiv.textContent = 'Connecting to server...';
        socket = new WebSocket('wss://chatp.net:5333/server');

        socket.onopen = async () => {
            isConnected = true;
            statusDiv.textContent = 'Connected to server';
            clearTimeout(reconnectTimeout);

            const loginMessage = {
                username: username,
                password: password,
                handler: 'login',
                id: generatePacketID()
            };
            await sendMessageToSocket(loginMessage);
        };

        socket.onmessage = (event) => {
            processReceivedMessage(event.data);
        };

        socket.onclose = () => {
            isConnected = false;
            statusDiv.textContent = 'Disconnected from server';
            attemptReconnect(username, password);
        };

        socket.onerror = (error) => {
            statusDiv.textContent = 'WebSocket error. Check console for details.';
            attemptReconnect(username, password);
        };
    }

    async function attemptReconnect(username, password) {
        if (!isConnected) {
            statusDiv.textContent = 'Attempting to reconnect...';
            reconnectTimeout = setTimeout(() => connectWebSocket(username, password), reconnectInterval);
        }
    }

    async function sendMessageToSocket(message) {
        return new Promise((resolve, reject) => {
            if (isConnected && socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify(message));
                resolve();
            } else {
                reject(new Error('WebSocket is not connected or not open'));
            }
        });
    }

    function generatePacketID() {
        return `R.U.BULAN©pinoy-2023®#${Math.random().toString(36).substring(7)}`;
    }

    function processReceivedMessage(message) {
        const jsonDict = JSON.parse(message);
        debugBox.value += `${message}\n`;

        switch (jsonDict.handler) {
            case 'login_event':
                handleLoginEvent(jsonDict);
                break;
            case 'roster':
                updateFriendList(jsonDict.users);
                break;
            case 'room_info':
                populateRoomList(jsonDict.rooms);
                break;
            case 'room_event':
                handleRoomEvent(jsonDict);
                break;
            case 'chat_message':
                handleChatMessage(jsonDict);
                break;
            default:
                console.log('Unhandled message handler:', jsonDict);
        }
    }

    function handleLoginEvent(jsonDict) {
        if (jsonDict.type === 'success') {
            loginForm.style.display = 'none';
            mainContent.style.display = 'block';
            statusDiv.textContent = 'Online';
            fetchFriendList(jsonDict.users);
            fetchChatrooms();
        } else {
            statusDiv.textContent = `Login failed: ${jsonDict.reason}`;
        }
    }

    async function fetchFriendList(users) {
        if (!users || !Array.isArray(users) || users.length === 0) {
            console.log('No users to fetch.');
            return;
        }

        updateFriendList(users);
    }

    async function fetchChatrooms() {
        const mucType = 'public_rooms';
        try {
            const allRooms = await getAllChatrooms(mucType);
            populateRoomList(allRooms);
        } catch (error) {
            console.error('Error fetching chatrooms:', error);
        }
    }

    async function getAllChatrooms(mucType) {
        let allRooms = [];
        let currentPage = 1;
        let totalPages = 1;

        while (currentPage <= totalPages) {
            try {
                const response = await getChatroomList(mucType, currentPage);
                if (response && response.rooms) {
                    allRooms = allRooms.concat(response.rooms);
                    totalPages = parseInt(response.page, 10) || 1;
                    currentPage++;
                } else {
                    break;
                }
            } catch (error) {
                console.error('Error fetching chatrooms:', error);
                break;
            }
        }

        return allRooms;
    }

    function populateRoomList(rooms) {
        roomListbox.innerHTML = '';

        rooms.forEach(room => {
            const listItem = document.createElement('li');
            const logo = document.createElement('div');
            logo.textContent = room.name.charAt(0).toUpperCase();
            logo.style.backgroundColor = '#000';
            logo.style.color = '#fff';
            logo.style.borderRadius = '50%';
            logo.style.width = '30px';
            logo.style.height = '30px';
            logo.style.display = 'flex';
            logo.style.justifyContent = 'center';
            logo.style.alignItems = 'center';

            const roomName = document.createElement('span');
            roomName.textContent = room.name;

            listItem.appendChild(logo);
            listItem.appendChild(roomName);
            roomListbox.appendChild(listItem);

            listItem.addEventListener('click', () => joinRoom(room.name));
        });
    }

    async function joinRoom(roomName) {
        const roomRequest = {
            handler: 'join_room',
            room: roomName,
            id: generatePacketID()
        };

        try {
            await sendMessageToSocket(roomRequest);
            displayRoomTab(roomName);
        } catch (error) {
            console.error('Error joining room:', error);
        }
    }

    function displayRoomTab(roomName) {
        const tabButton = document.createElement('button');
        tabButton.textContent = roomName;
        tabButton.classList.add('tab-button');

        const tabContent = document.createElement('div');
        tabContent.classList.add('tab');
        tabContent.dataset.roomName = roomName;

        const chatbox = document.createElement('div');
        chatbox.classList.add('chatbox');

        const userListBox = document.createElement('div');
        userListBox.classList.add('user-listbox');

        const inputBox = document.createElement('input');
        inputBox.type = 'text';
        inputBox.classList.add('input-box');

        const sendButton = document.createElement('button');
        sendButton.textContent = 'Send';
        sendButton.classList.add('send-button');

        sendButton.addEventListener('click', () => {
            const message = inputBox.value;
            if (message) {
                sendChatMessage(roomName, message);
                inputBox.value = '';
            }
        });

        tabContent.appendChild(chatbox);
        tabContent.appendChild(userListBox);
        tabContent.appendChild(inputBox);
        tabContent.appendChild(sendButton);

        tabButtonsContainer.appendChild(tabButton);
        tabsContainer.appendChild(tabContent);

        tabButton.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(tab => {
                tab.style.display = 'none';
            });
            tabContent.style.display = 'block';
        });
    }

    async function sendChatMessage(roomName, message) {
        const chatMessage = {
            handler: 'chat_message',
            type: 'text',
            room: roomName,
            body: message,
            id: generatePacketID()
        };

        try {
            await sendMessageToSocket(chatMessage);
        } catch (error) {
            console.error('Error sending chat message:', error);
        }
    }

    function handleRoomEvent(jsonDict) {
        if (jsonDict.type === 'joined') {
            const roomName = jsonDict.room;
            displayRoomTab(roomName);
        } else {
            console.log('Unhandled room event:', jsonDict);
        }
    }

    function handleChatMessage(jsonDict) {
        const roomName = jsonDict.room;
        const message = jsonDict.body;
        const chatbox = document.querySelector(`.tab[data-room-name="${roomName}"] .chatbox`);

        if (chatbox) {
            const messageElement = document.createElement('div');
            messageElement.classList.add('message');
            messageElement.textContent = message;
            chatbox.appendChild(messageElement);
        }
    }

    function updateFriendList(users) {
        friendListbox.innerHTML = '';

        users.forEach(user => {
            const listItem = document.createElement('li');
            listItem.textContent = user;
            friendListbox.appendChild(listItem);
        });
    }
});
