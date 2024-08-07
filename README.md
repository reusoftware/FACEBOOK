# FACEBOOK



import asyncio
import websockets
import json
import uuid
import requests
from bs4 import BeautifulSoup

child_bots = {}
tweet_storage = {}
current_room = "homies"
user_status = {}  # To keep track of user status

async def connect_websocket(username, password):
    uri = "wss://chatp.net:5333/server"  # Replace with your WebSocket URI

    async def keep_alive(websocket):
        while True:
            try:
                await websocket.ping()
                await asyncio.sleep(20)
            except Exception as e:
                print(f"Error sending ping: {e}")
                break

    while True:
        try:
            async with websockets.connect(uri) as websocket:
                print("Connected to WebSocket")

                await websocket.send(json.dumps({
                    "handler": "login",
                    "username": username,
                    "password": password
                }))

                keep_alive_task = asyncio.create_task(keep_alive(websocket))

                while True:
                    try:
                        message = await websocket.recv()
                        print(f"Received message: {message}")
                        await handle_messages(websocket, message)
                    except websockets.ConnectionClosed as e:
                        print(f"Connection closed with code {e.code} and reason: {e.reason}")
                        break  # Break out of inner while loop to reconnect
                    except Exception as e:
                        print(f"Error in receiving message: {e}")
                        break  # Break out of inner while loop to reconnect

                keep_alive_task.cancel()
        except Exception as e:
            print(f"Error connecting to WebSocket: {e}")
            await asyncio.sleep(5)  # Wait before attempting to reconnect

async def handle_messages(websocket, message):
    message_obj = json.loads(message)
    handler = message_obj.get("handler")
    msg_type = message_obj.get("type")
    if handler == 'login_event':
        await handle_login_event(message_obj, websocket)
    elif handler == "room_event" and msg_type == "text":
        await process_room_message(message_obj, websocket)
    elif handler == "room_event" and msg_type == "user_joined":
        await send_welcome_message(message_obj.get("room"), websocket)
    elif handler == "chat_message":
        await handle_private_message(message_obj, websocket)
    elif handler == "captcha_required":
        await handle_captcha(message_obj)

async def handle_login_event(message_obj, websocket):
    global current_username, current_room
    type_event = message_obj.get('type')
    if type_event == 'success':
        current_username = message_obj.get('username')
        print(f"Login successful as {current_username}")
        await join_room(current_room, websocket)

async def join_room(room_name, websocket):
    join_message = {
        "handler": "room_join",
        "id": str(uuid.uuid4()),
        "name": room_name
    }
    await websocket.send(json.dumps(join_message))
    print(f"Sent join room message: {join_message}")

async def process_room_message(message_obj, websocket):
    body = message_obj.get("body")
    from_user = message_obj.get("from")
    room = message_obj.get("room")

    if body.startswith("j/"):
        await handle_join_command(body, from_user, websocket, room)
    elif body.startswith("tweet/"):
        await handle_tweet_command(from_user, websocket, body[6:], room)
    elif body == "mytweets":
        await handle_tweet_retrieve_command(from_user, websocket, room)
    elif body.startswith("img/"):
        query = body[4:]
        await search_and_send_image(query, room, websocket)
    elif body.startswith("is@"):
        await check_user_status(body[3:], websocket, room)

async def handle_private_message(message_obj, websocket):
    body = message_obj.get("body")
    from_user = message_obj.get("from")

    if body.startswith("j/"):
        await handle_join_command(body, from_user, websocket, current_room)
    elif body.startswith("tweet/"):
        await handle_tweet_command(from_user, websocket, body[6:], current_room)
    elif body == "mytweets":
        await handle_tweet_retrieve_command(from_user, websocket, current_room)
    elif body.startswith("img/"):
        query = body[4:]
        await search_and_send_image(query, from_user, websocket)
    elif body.startswith("is@"):
        await check_user_status(body[3:], websocket, current_room)

async def send_welcome_message(room, websocket):
    welcome_message = "Welcome to the room! I'm your bot, here to assist you."
    await websocket.send(json.dumps({
        "handler": "room_message",
        "type": "text",
        "id": str(uuid.uuid4()),
        "body": welcome_message,
        "room": room,
        "url": "",
        "length": '0'
    }))

async def handle_join_command(body_event, from_event, websocket, room):
    try:
        parts = body_event.split("#")
        if len(parts) != 3:
            await websocket.send(json.dumps({
                "handler": "room_message",
                "type": "text",
                "id": str(uuid.uuid4()),
                "body": "Invalid join command format. Use 'j/roomname#botid#botpassword'",
                "room": room,
                "url": "",
                "length": '0'
            }))
            return
        
        room_name, bot_id, bot_password = parts[0][2:], parts[1], parts[2]
        await create_and_join_child_bot(bot_id, bot_password, room_name, websocket)
    except Exception as e:
        print(f"Error handling join command: {e}")

async def create_and_join_child_bot(bot_id, bot_password, room_name, main_websocket):
    try:
        child_bots[bot_id] = {"room": room_name}

        # Start a new coroutine for each child bot
        asyncio.create_task(connect_child_bot(bot_id, bot_password, room_name))

        await main_websocket.send(json.dumps({
            "handler": "room_message",
            "type": "text",
            "id": str(uuid.uuid4()),
            "body": f"Child bot '{bot_id}' created and joined room '{room_name}'",
            "room": current_room,
            "url": "",
            "length": '0'
        }))
    except Exception as e:
        print(f"Error creating and joining child bot: {e}")

async def connect_child_bot(bot_id, bot_password, room_name):
    uri = "wss://chatp.net:5333/server"  # Replace with your WebSocket URI

    async def keep_alive(websocket):
        while True:
            try:
                await websocket.ping()
                await asyncio.sleep(20)
            except Exception as e:
                print(f"Error sending ping: {e}")
                break

    while True:
        try:
            async with websockets.connect(uri) as websocket:
                print(f"Child bot '{bot_id}' connected to WebSocket")

                await websocket.send(json.dumps({
                    "handler": "login",
                    "username": bot_id,
                    "password": bot_password
                }))

                keep_alive_task = asyncio.create_task(keep_alive(websocket))

                while True:
                    try:
                        message = await websocket.recv()
                        print(f"Child bot '{bot_id}' received message: {message}")
                        await handle_child_bot_messages(websocket, message, bot_id)
                    except websockets.ConnectionClosed as e:
                        print(f"Child bot '{bot_id}' connection closed with code {e.code} and reason: {e.reason}")
                        break  # Break out of inner while loop to reconnect
                    except Exception as e:
                        print(f"Error in child bot '{bot_id}' receiving message: {e}")
                        break  # Break out of inner while loop to reconnect

                keep_alive_task.cancel()
        except Exception as e:
            print(f"Error connecting child bot '{bot_id}' to WebSocket: {e}")
            await asyncio.sleep(5)  # Wait before attempting to reconnect

async def handle_child_bot_messages(websocket, message, bot_id):
    message_obj = json.loads(message)
    handler = message_obj.get("handler")
    msg_type = message_obj.get("type")

    if handler == 'login_event':
        if message_obj.get('type') == 'success':
            await join_room(child_bots[bot_id]['room'], websocket)
    elif handler == "room_event" and msg_type == "text":
        await process_child_bot_room_message(message_obj, websocket, bot_id)
    elif handler == "room_event" and msg_type == "user_joined":
        await send_welcome_message(child_bots[bot_id]['room'], websocket)

async def process_child_bot_room_message(message_obj, websocket, bot_id):
    body = message_obj.get("body")
    room = message_obj.get("room")

    # Implement child bot specific message handling here
    print(f"Child bot '{bot_id}' received message in room '{room}': {body}")

async def handle_tweet_command(from_event, websocket, tweet_message, room):
    try:
        if from_event not in tweet_storage:
            tweet_storage[from_event] = []
        
        tweet_storage[from_event].append(tweet_message)
        await websocket.send(json.dumps({
            "handler": "room_message",
            "type": "text",
            "id": str(uuid.uuid4()),
            "body": "Tweet saved successfully",
            "room": room,
            "url": "",
            "length": '0'
        }))
    except Exception as e:
        print(f"Error handling tweet command: {e}")

async def handle_tweet_retrieve_command(from_event, websocket, room):
    try:
        tweets = tweet_storage.get(from_event, [])
        if not tweets:
            await websocket.send(json.dumps({
                "handler": "room_message",
                "type": "text",
                "id": str(uuid.uuid4()),
                "body": "No tweets found",
                "room": room,
                "url": "",
                "length": '0'
            }))
            return

        tweet_list = "\n".join(tweets)
        await websocket.send(json.dumps({
            "handler": "room_message",
            "type": "text",
            "id": str(uuid.uuid4()),
            "body": f"Your tweets:\n{tweet_list}",
            "room": room,
            "url": "",
            "length": '0'
        }))
    except Exception as e:
        print(f"Error handling tweet retrieve command: {e}")

async def search_and_send_image(query, room, websocket):
    try:
        search_url = f"https://www.google.com/search?q={query}&tbm=isch"
        response = requests.get(search_url)
        soup = BeautifulSoup(response.text, 'html.parser')
        img_tag = soup.find("img")

        if img_tag:
            img_url = img_tag["src"]
            await websocket.send(json.dumps({
                "handler": "room_message",
                "type": "image",
                "id": str(uuid.uuid4()),
                "body": "",
                "room": room,
                "url": img_url,
                "length": '0'
            }))
        else:
            await websocket.send(json.dumps({
                "handler": "room_message",
                "type": "text",
                "id": str(uuid.uuid4()),
                "body": "No image found",
                "room": room,
                "url": "",
                "length": '0'
            }))
    except Exception as e:
        print(f"Error searching and sending image: {e}")

async def handle_captcha(message_obj):
    try:
        captcha_image_url = message_obj.get("url")
        print(f"Captcha required: {captcha_image_url}")
        # Display the captcha image to the user and get their input to solve it
        captcha_solution = input("Please solve the captcha: ")
        # Send the solved captcha back to the server
        await websocket.send(json.dumps({
            "handler": "captcha_solution",
            "solution": captcha_solution
        }))
    except Exception as e:
        print(f"Error handling captcha: {e}")

async def check_user_status(user, websocket, room):
    try:
        user_status[user] = user_status.get(user, "offline")
        await websocket.send(json.dumps({
            "handler": "room_message",
            "type": "text",
            "id": str(uuid.uuid4()),
            "body": f"User '{user}' is currently {user_status[user]}",
            "room": room,
            "url": "",
            "length": '0'
        }))
    except Exception as e:
        print(f"Error checking user status: {e}")

if __name__ == "__main__":
    username = input("Enter your username: ")
    password = input("Enter your password: ")

    loop = asyncio.get_event_loop()
    loop.run_until_complete(connect_websocket(username, password))
    loop.run_forever()
