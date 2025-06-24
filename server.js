const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const fs = require("fs");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Инициализация базы данных
const db = new sqlite3.Database("./chat.db");

// Создание таблиц
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      password TEXT,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id INTEGER,
      username TEXT NOT NULL,
      text TEXT NOT NULL,
      time DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_edited BOOLEAN DEFAULT FALSE,
      type TEXT DEFAULT 'text',
      FOREIGN KEY(room_id) REFERENCES rooms(id) ON DELETE CASCADE
    )
  `);
});

// Настройка загрузки файлов
const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

if (!fs.existsSync("uploads")) {
  fs.mkdirSync("uploads", { recursive: true });
}

app.use(express.json());
app.use(express.static(""));

// API для получения списка комнат
app.get("/api/rooms", (req, res) => {
  db.all("SELECT id, name, description FROM rooms", [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// API для получения информации о комнате
app.get("/api/rooms/:id", (req, res) => {
  db.get(
    "SELECT id, name, description, password IS NOT NULL as has_password, created_by FROM rooms WHERE id = ?",
    [req.params.id],
    (err, row) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (!row) {
        return res.status(404).json({ error: "Room not found" });
      }
      res.json(row);
    }
  );
});

// API для создания комнаты
app.post("/api/rooms", (req, res) => {
  const { name, description, password, username } = req.body;

  if (!name || !username) {
    return res.status(400).json({ error: "Name and username are required" });
  }

  const hashedPassword = password ? bcrypt.hashSync(password, 10) : null;

  db.run(
    "INSERT INTO rooms (name, description, password, created_by) VALUES (?, ?, ?, ?)",
    [name, description, hashedPassword, username],
    function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ id: this.lastID, name, description });
    }
  );
});

// API для проверки пароля комнаты
app.post("/api/rooms/:id/check-password", (req, res) => {
  const { password } = req.body;
  const roomId = req.params.id;

  db.get("SELECT password FROM rooms WHERE id = ?", [roomId], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      return res.status(404).json({ error: "Room not found" });
    }

    const passwordMatch = row.password
      ? bcrypt.compareSync(password, row.password)
      : true;
    res.json({ valid: passwordMatch });
  });
});

// API для удаления комнаты
app.delete("/api/rooms/:id", (req, res) => {
  const { password } = req.body;
  const roomId = req.params.id;

  db.get(
    "SELECT password, created_by FROM rooms WHERE id = ?",
    [roomId],
    (err, row) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (!row) {
        return res.status(404).json({ error: "Room not found" });
      }

      const passwordValid = row.password
        ? bcrypt.compareSync(password, row.password)
        : true;

      if (!passwordValid) {
        return res.status(403).json({ error: "Invalid password" });
      }

      db.run("DELETE FROM rooms WHERE id = ?", [roomId], function (err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json({ success: true });
      });
    }
  );
});

// API для загрузки файлов
app.post("/api/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const fileExt = path.extname(req.file.originalname);
  const newFileName = `${req.file.filename}${fileExt}`;
  const newPath = path.join(req.file.destination, newFileName);

  fs.renameSync(req.file.path, newPath);

  res.json({
    success: true,
    url: `/uploads/${newFileName}`,
    type: req.body.type,
  });
});

// Хранилище активных соединений по комнатам
const activeConnections = {};

wss.on("connection", (ws) => {
  let currentRoom = null;
  let currentUsername = null;

  ws.on("message", async (message) => {
    const data = JSON.parse(message);

    switch (data.type) {
      case "join":
        currentRoom = data.roomId;
        currentUsername = data.username;

        if (!activeConnections[currentRoom]) {
          activeConnections[currentRoom] = new Set();
        }
        activeConnections[currentRoom].add(ws);

        db.all(
          "SELECT id, username, text, time, is_edited, type FROM messages WHERE room_id = ? ORDER BY time",
          [currentRoom],
          (err, messages) => {
            if (err) {
              console.error(err);
              return;
            }
            ws.send(
              JSON.stringify({
                type: "history",
                messages: messages.map((msg) => ({
                  ...msg,
                  time: new Date(msg.time).toLocaleTimeString(),
                  canEdit: msg.username === currentUsername,
                })),
              })
            );
          }
        );
        break;

      case "message":
      case "image":
      case "video":
      case "audio":
        if (!currentRoom || !currentUsername) return;

        const messageData = {
          room_id: currentRoom,
          username: currentUsername,
          text: data.text || data.url,
          time: new Date().toISOString(),
          is_edited: false,
          type: data.type,
        };

        db.run(
          "INSERT INTO messages (room_id, username, text, time, is_edited, type) VALUES (?, ?, ?, ?, ?, ?)",
          [
            messageData.room_id,
            messageData.username,
            messageData.text,
            messageData.time,
            messageData.is_edited,
            messageData.type,
          ],
          function (err) {
            if (err) {
              console.error(err);
              return;
            }

            const fullMessage = {
              ...messageData,
              id: this.lastID,
              time: new Date(messageData.time).toLocaleTimeString(),
              canEdit: messageData.username === currentUsername,
              url: data.url,
            };

            if (activeConnections[currentRoom]) {
              activeConnections[currentRoom].forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                  client.send(JSON.stringify(fullMessage));
                }
              });
            }
          }
        );
        break;

      case "edit":
        if (!currentRoom || !currentUsername) return;

        db.run(
          "UPDATE messages SET text = ?, is_edited = TRUE WHERE id = ? AND username = ? AND type = 'text'",
          [data.newText, data.messageId, currentUsername],
          function (err) {
            if (err) {
              console.error(err);
              return;
            }

            if (this.changes > 0) {
              db.get(
                "SELECT id, username, text, time, is_edited FROM messages WHERE id = ?",
                [data.messageId],
                (err, msg) => {
                  if (err) {
                    console.error(err);
                    return;
                  }

                  const editedMessage = {
                    type: "edit",
                    id: msg.id,
                    username: msg.username,
                    text: msg.text,
                    time: new Date(msg.time).toLocaleTimeString(),
                    is_edited: true,
                    canEdit: msg.username === currentUsername,
                  };

                  if (activeConnections[currentRoom]) {
                    activeConnections[currentRoom].forEach((client) => {
                      if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify(editedMessage));
                      }
                    });
                  }
                }
              );
            }
          }
        );
        break;

      case "delete":
        if (!currentRoom || !currentUsername) return;

        db.run(
          "DELETE FROM messages WHERE id = ? AND username = ?",
          [data.messageId, currentUsername],
          function (err) {
            if (err) {
              console.error(err);
              return;
            }

            if (this.changes > 0) {
              const deleteNotification = {
                type: "delete",
                messageId: data.messageId,
              };

              if (activeConnections[currentRoom]) {
                activeConnections[currentRoom].forEach((client) => {
                  if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(deleteNotification));
                  }
                });
              }
            }
          }
        );
        break;
    }
  });

  ws.on("close", () => {
    if (currentRoom && activeConnections[currentRoom]) {
      activeConnections[currentRoom].delete(ws);
      if (activeConnections[currentRoom].size === 0) {
        delete activeConnections[currentRoom];
      }
    }
  });
});

function pingSelf() {
    const url = 'https://usatenko.onrender.com'; // ваш URL
    axios.get(url)
        .then(() => console.log('Пинг успешен!'))
        .catch(err => console.error('Ошибка пинга:', err));
}

// Пинг каждые 5 минут (300000 мс)
setInterval(pingSelf, 5 * 60 * 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Сервер запущен на http://localhost:${PORT}`);
});
