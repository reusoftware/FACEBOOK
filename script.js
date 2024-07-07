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
    const friendListTab = document.getElementById('friendsTab');

    loginButton.addEventListener('click', async () => {
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        currentUsername = username;
        await connectWebSocket(username, password);
    });

    function activateTab(tabId) {
        tabs.forEach(tab => {
            if (tab.id === tabId) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });
    }

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.getAttribute('data-tab');
            activateTab(tabId);
        });
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

    async function getChatroomList(mucType, pageNum) {
        const packetID = generatePacketID();
        const listRequest = {
            handler: 'room_info',
            type: mucType,
            id: packetID,
            page: pageNum.toString()
        };

        return new Promise((resolve, reject) => {
            socket.send(JSON.stringify(listRequest));

            const handleResponse = (event) => {
                try {
                    const response = JSON.parse(event.data);
                    if (response.handler === 'room_info' && response.type === mucType) {
                        socket.removeEventListener('message', handleResponse);
                        resolve(response);
                    }
                } catch (error) {
                    reject(error);
                }
            };

            socket.addEventListener('message', handleResponse);

            socket.onerror = (error) => {
                reject(error);
            };
        });
    }

    function populateRoomList(rooms) {
        if (!rooms || !Array.isArray(rooms) || rooms.length === 0) {
            console.log('No rooms to display.');
            return;
        }

        roomListbox.innerHTML = '';

        rooms.forEach(room => {
            const listItem = document.createElement('li');
            const logo = document.createElement('span');
            logo.textContent = room.name.charAt(0);
            logo.classList.add('room-logo');

            listItem.appendChild(logo);
            listItem.appendChild(document.createTextNode(` ${room.name} (${room.users_count} users)`));

            if (room.password_protected === '1') {
                listItem.textContent += ' [Password Protected]';
            } else if (room.members_only === '1') {
                listItem.textContent += ' [Members Only]';
            }

            roomListbox.appendChild(listItem);

            listItem.addEventListener('click', () => {
                const roomName = room.name;
                joinRoom(roomName);
            });
        });
    }

    async function joinRoom(roomName) {
        try {
            const joinMessage = {
                handler: 'join_room',
                id: generatePacketID(),
                name: roomName
            };
            await sendMessageToSocket(joinMessage);
            await fetchUserList(roomName);

            // Example: Update room input or other UI elements
            const roomInput = document.getElementById('room');
            roomInput.value = roomName;

            // Example: Open tab for the joined room
            openRoomTab(roomName);
        } catch (error) {
            console.error(`Error joining room: ${error.message}`);
            // Handle errors or display messages as needed
        }
    }

    function openRoomTab(roomName) {
        const tabId = `tab-${roomName}`;
        const existingTab = document.getElementById(tabId);

        if (existingTab) {
            activateTab(tabId);
            return;
        }

        // Create new tab button
        const newTabButton = document.createElement('button');
        newTabButton.textContent = roomName;
        newTabButton.setAttribute('data-tab', tabId);
        newTabButton.classList.add('tabButton');

        // Create new tab content
        const newTabContent = document.createElement('div');
        newTabContent.id = tabId;
        newTabContent.classList.add('tab');

        // Create chat box
        const chatBox = document.createElement('div');
        chatBox.id = 'chatBox';
        chatBox.classList.add('chat-box');
        newTabContent.appendChild(chatBox);

        // Create user list
        const userList = document.createElement('ul');
        userList.id = 'userList';
        userList.classList.add('user-list');
        newTabContent.appendChild(userList);

        // Optional: Add role-setting buttons or additional UI elements

        // Append tab button and content
        tabButtonsContainer.appendChild(newTabButton);
        tabsContainer.appendChild(newTabContent);

        // Activate the new tab
        activateTab(tabId);
    }

    async function fetchUserList(roomName) {
        // Example: Fetch user list for the specified room and update UI
        const users = await getUsersInRoom(roomName);
        updateUsersList(users);
    }

    async function getUsersInRoom(roomName) {
        // Simulate fetching users for the room from WebSocket message
        return new Promise(resolve => {
            setTimeout(() => {
                resolve([
                    { username: 'user1', role: 'admin' },
                    { username: 'user2', role: 'member' },
                    { username: 'user3', role: 'member' }
                ]);
            }, 1000);
        });
    }

    function updateUsersList(users) {
        const userList = document.getElementById('userList');
        userList.innerHTML = '';

        users.forEach(user => {
            const userItem = document.createElement('li');
            userItem.textContent = `${user.username} (${user.role})`;
            userList.appendChild(userItem);
        });
    }

    function handleRoomEvent(jsonDict) {
        // Example: Handle room events like user join, leave, permissions change
        console.log('Room Event:', jsonDict);
    }

    function handleChatMessage(jsonDict) {
        // Example: Handle incoming chat messages and update UI
        console.log('Chat Message:', jsonDict);
    }

    // Optional: Add other functions as needed

});
