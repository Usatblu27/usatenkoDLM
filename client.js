const usernameInput = document.getElementById("username");
const loginBtn = document.getElementById("login-btn");
const loginContainer = document.getElementById("login-container");
const roomsContainer = document.getElementById("rooms-container");
const chatContainer = document.getElementById("chat-container");
const messagesDiv = document.getElementById("messages");
const messageInput = document.getElementById("message-input");
const sendBtn = document.getElementById("send-btn");
const roomsList = document.getElementById("rooms-list");
const createRoomBtn = document.getElementById("create-room-btn");
const createRoomForm = document.getElementById("create-room-form");
const roomNameInput = document.getElementById("room-name");
const roomDescInput = document.getElementById("room-desc");
const roomPasswordInput = document.getElementById("room-password");
const submitRoomBtn = document.getElementById("submit-room-btn");
const roomPasswordForm = document.getElementById("room-password-form");
const roomPasswordCheckInput = document.getElementById("room-password-check");
const submitPasswordBtn = document.getElementById("submit-password-btn");
const backToRoomsBtn = document.getElementById("back-to-rooms");
const currentRoomTitle = document.getElementById("current-room-title");
const deleteRoomBtn = document.getElementById("delete-room-btn");
const deleteRoomForm = document.getElementById("delete-room-form");
const deleteRoomPasswordInput = document.getElementById("delete-room-password");
const confirmDeleteRoomBtn = document.getElementById("confirm-delete-room-btn");
const cancelDeleteRoomBtn = document.getElementById("cancel-delete-room-btn");

let socket;
let currentUsername = "";
let currentRoomId = null;
let currentRoomName = "";
let isRoomCreator = false;

function showRooms() {
  roomsContainer.style.display = "block";
  chatContainer.style.display = "none";
  deleteRoomForm.style.display = "none";
  fetchRooms();
}

function fetchRooms() {
  fetch("/api/rooms")
    .then((response) => response.json())
    .then((rooms) => {
      roomsList.innerHTML = "";
      rooms.forEach((room) => {
        const roomElement = document.createElement("div");
        roomElement.className = "room-item";
        roomElement.innerHTML = `
          <h3>${room.name}</h3>
          <p>${room.description || "Нет описания"}</p>
          <button class="join-room-btn" data-id="${room.id}">Войти</button>
        `;
        roomsList.appendChild(roomElement);
      });

      document.querySelectorAll(".join-room-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          checkRoomPassword(btn.dataset.id);
        });
      });
    })
    .catch((error) => console.error("Ошибка при загрузке комнат:", error));
}

function checkRoomPassword(roomId) {
  fetch(`/api/rooms/${roomId}`)
    .then((response) => response.json())
    .then((room) => {
      if (room.has_password) {
        roomPasswordForm.style.display = "block";
        roomPasswordForm.dataset.roomId = roomId;
        roomPasswordForm.dataset.roomName = room.name;
      } else {
        joinRoom(roomId, room.name);
      }
    })
    .catch((error) => console.error("Ошибка при проверке комнаты:", error));
}

function joinRoom(roomId, roomName) {
  currentRoomId = roomId;
  currentRoomName = roomName;
  currentRoomTitle.textContent = roomName;

  fetch(`/api/rooms/${roomId}`)
    .then((response) => response.json())
    .then((room) => {
      isRoomCreator = room.created_by === currentUsername;
      deleteRoomBtn.style.display = isRoomCreator ? "block" : "none";
    });

  roomsContainer.style.display = "none";
  roomPasswordForm.style.display = "none";
  chatContainer.style.display = "block";

  connect();
}

function addMessage(message, isOwn = false) {
  const msgElement = document.createElement("div");
  msgElement.className = `message ${isOwn ? "own-message" : ""}`;
  msgElement.dataset.messageId = message.id;

  let content;
  switch (message.type) {
    case "image":
      content = `<img src="${
        message.url || message.text
      }" class="media-content" alt="Изображение">`;
      break;
    case "video":
      content = `<video controls class="media-content"><source src="${
        message.url || message.text
      }"></video>`;
      break;
    case "audio":
      content = `<audio controls class="media-content"><source src="${
        message.url || message.text
      }"></audio>`;
      break;
    default:
      content = `<div class="text">${message.text}</div>`;
  }

  const messageContent = `
    <span class="username">${message.username}</span>
    <span class="time">${message.time} ${
    message.is_edited ? "(изменено)" : ""
  }</span>
    ${content}
  `;

  msgElement.innerHTML = messageContent;

  if (message.username === currentUsername) {
    const controls = document.createElement("div");
    controls.className = "message-controls";
    controls.innerHTML = `
      <button class="edit-btn">✏️</button>
      <button class="delete-btn">🗑️</button>
    `;
    msgElement.appendChild(controls);

    controls.querySelector(".edit-btn").addEventListener("click", () => {
      if (message.type === "text" || !message.type) {
        editMessage(message.id, message.text);
      } else {
        alert("Медиафайлы нельзя редактировать");
      }
    });

    controls.querySelector(".delete-btn").addEventListener("click", () => {
      deleteMessage(message.id);
    });
  }

  messagesDiv.appendChild(msgElement);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function addSystemMessage(text) {
  const sysElement = document.createElement("div");
  sysElement.className = "system-message";
  sysElement.textContent = text;
  messagesDiv.appendChild(sysElement);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function editMessage(messageId, currentText) {
  const newText = prompt("Редактировать сообщение:", currentText);
  if (newText && newText !== currentText) {
    socket.send(
      JSON.stringify({
        type: "edit",
        messageId: messageId,
        newText: newText,
      })
    );
  }
}

function deleteMessage(messageId) {
  if (confirm("Удалить это сообщение?")) {
    socket.send(
      JSON.stringify({
        type: "delete",
        messageId: messageId,
      })
    );
  }
}

function deleteRoom() {
  deleteRoomForm.style.display = "block";
}

function confirmDeleteRoom() {
  const password = deleteRoomPasswordInput.value;

  fetch(`/api/rooms/${currentRoomId}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password }),
  })
    .then((response) => {
      if (!response.ok) {
        return response.json().then((err) => {
          throw err;
        });
      }
      return response.json();
    })
    .then(() => {
      addSystemMessage(`Комната "${currentRoomName}" была удалена`);
      setTimeout(() => {
        if (socket) {
          socket.close();
        }
        showRooms();
      }, 1500);
    })
    .catch((error) => {
      alert(error.error || "Не удалось удалить комнату");
      console.error("Ошибка при удалении комнаты:", error);
    })
    .finally(() => {
      deleteRoomForm.style.display = "none";
      deleteRoomPasswordInput.value = "";
    });
}

function connect() {
  if (socket) {
    socket.onclose = null;
    socket.close();
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  socket = new WebSocket(`${protocol}//${window.location.host}`);

  socket.onopen = () => {
    console.log("Connected to server");
    socket.send(
      JSON.stringify({
        type: "join",
        roomId: currentRoomId,
        username: currentUsername,
      })
    );
    addSystemMessage(
      `Вы вошли в комнату "${currentRoomName}" как ${currentUsername}`
    );
  };

  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);

    switch (data.type) {
      case "history":
        messagesDiv.innerHTML = "";
        data.messages.forEach((msg) => {
          addMessage(
            {
              ...msg,
              canEdit: msg.username === currentUsername,
            },
            msg.username === currentUsername
          );
        });
        break;

      case "message":
      case "image":
      case "video":
      case "audio":
        addMessage(
          {
            ...data,
            canEdit: data.username === currentUsername,
          },
          data.username === currentUsername
        );
        break;

      case "edit":
        const editedMsgElement = document.querySelector(
          `.message[data-message-id="${data.id}"]`
        );
        if (editedMsgElement) {
          const textElement = editedMsgElement.querySelector(".text");
          if (textElement) {
            textElement.textContent = data.text;
          }
          const timeElement = editedMsgElement.querySelector(".time");
          timeElement.textContent = `${data.time} (изменено)`;
        }
        break;

      case "delete":
        const deletedMsgElement = document.querySelector(
          `.message[data-message-id="${data.messageId}"]`
        );
        if (deletedMsgElement) {
          deletedMsgElement.remove();
        }
        break;
    }
  };

  socket.onclose = () => {
    addSystemMessage("Соединение прервано. Переподключаемся...");
    setTimeout(connect, 3000);
  };
}

function uploadFile(file, type) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("roomId", currentRoomId);
  formData.append("username", currentUsername);
  formData.append("type", type);

  fetch("/api/upload", {
    method: "POST",
    body: formData,
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.success) {
        socket.send(
          JSON.stringify({
            type: type,
            url: data.url,
            username: currentUsername,
            time: new Date().toLocaleTimeString(),
          })
        );
      }
    })
    .catch((error) => console.error("Ошибка загрузки:", error));
}

// Обработчики событий
loginBtn.addEventListener("click", () => {
  const username = usernameInput.value.trim();
  if (username) {
    currentUsername = username;
    localStorage.setItem("username", username);
    loginContainer.style.display = "none";
    showRooms();
  }
});

createRoomBtn.addEventListener("click", () => {
  createRoomForm.style.display = "block";
});

submitRoomBtn.addEventListener("click", () => {
  const name = roomNameInput.value.trim();
  const description = roomDescInput.value.trim();
  const password = roomPasswordInput.value.trim();

  if (!name) {
    alert("Название комнаты обязательно");
    return;
  }

  fetch("/api/rooms", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      description,
      password: password || null,
      username: currentUsername,
    }),
  })
    .then((response) => response.json())
    .then((data) => {
      createRoomForm.style.display = "none";
      roomNameInput.value = "";
      roomDescInput.value = "";
      roomPasswordInput.value = "";
      joinRoom(data.id, name);
    })
    .catch((error) => {
      console.error("Ошибка при создании комнаты:", error);
      alert("Не удалось создать комнату");
    });
});

submitPasswordBtn.addEventListener("click", () => {
  const password = roomPasswordCheckInput.value;
  const roomId = roomPasswordForm.dataset.roomId;
  const roomName = roomPasswordForm.dataset.roomName;

  fetch(`/api/rooms/${roomId}/check-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password }),
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.valid) {
        roomPasswordCheckInput.value = "";
        roomPasswordForm.style.display = "none";
        joinRoom(roomId, roomName);
      } else {
        alert("Неверный пароль");
      }
    })
    .catch((error) => {
      console.error("Ошибка при проверке пароля:", error);
      alert("Ошибка при проверке пароля");
    });
});

backToRoomsBtn.addEventListener("click", () => {
  if (socket) {
    socket.close();
  }
  showRooms();
});

deleteRoomBtn.addEventListener("click", deleteRoom);
confirmDeleteRoomBtn.addEventListener("click", confirmDeleteRoom);
cancelDeleteRoomBtn.addEventListener("click", () => {
  deleteRoomForm.style.display = "none";
  deleteRoomPasswordInput.value = "";
});

sendBtn.addEventListener("click", () => {
  const text = messageInput.value.trim();
  if (text && socket && socket.readyState === WebSocket.OPEN) {
    socket.send(
      JSON.stringify({
        type: "message",
        text: text,
      })
    );
    messageInput.value = "";
  }
});

messageInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    sendBtn.click();
  }
});

// Добавляем кнопку для загрузки файлов
const fileInput = document.createElement("input");
fileInput.type = "file";
fileInput.style.display = "none";
fileInput.accept = "image/*,video/*,audio/*";
document.body.appendChild(fileInput);

const mediaBtn = document.createElement("button");
mediaBtn.textContent = "📎";
mediaBtn.id = "media-btn";
sendBtn.parentNode.insertBefore(mediaBtn, sendBtn);

mediaBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", () => {
  if (fileInput.files.length > 0) {
    const file = fileInput.files[0];
    const type = file.type.split("/")[0];

    if (type === "image") {
      uploadFile(file, "image");
    } else if (type === "video") {
      uploadFile(file, "video");
    } else if (type === "audio") {
      uploadFile(file, "audio");
    }

    fileInput.value = "";
  }
});

// Инициализация
if (localStorage.getItem("username")) {
  usernameInput.value = localStorage.getItem("username");
}
