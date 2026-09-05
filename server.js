const express = require("express");
const http = require("http");
const os = require("os");
const QRCode = require("qrcode");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

const state = {
  participants: new Set(),
  phishing: { A: 0, B: 0, C: 0 },
  ai: { A: 0, B: 0, C: 0 },
  security: { 0: 0, 20: 0, 40: 0, 60: 0, 80: 0, 100: 0 },
  securityCompleted: 0,
  completed: 0
};

app.use(express.static("public"));

function getIPs() {
  const nets = os.networkInterfaces();
  const out = [];

  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === "IPv4" && !net.internal) {
        out.push(net.address);
      }
    }
  }

  return out;
}

function payload() {
  return {
    participants: state.participants.size,
    phishing: state.phishing,
    ai: state.ai,
    security: state.security,
    securityCompleted: state.securityCompleted,
    completed: state.completed
  };
}

app.get("/api/status", (req, res) => {
  res.json(payload());
});

app.get("/api/qr", async (req, res) => {
  const host = req.query.host || getIPs()[0] || "localhost";
  const url = `http://${host}:${PORT}`;

  try {
    const data = await QRCode.toDataURL(url, {
      margin: 1,
      width: 420
    });

    res.json({ url, qr: data, ips: getIPs() });
  } catch (e) {
    res.status(500).json({ error: "QR generation failed" });
  }
});

io.on("connection", socket => {

  socket.emit("state", payload());

  socket.on("joinParticipant", () => {
    if (!socket.data.participantJoined) {
      socket.data.participantJoined = true;
      state.participants.add(socket.id);
      io.emit("state", payload());
    }
  });

  socket.on("answer", data => {

    if (!socket.data.participantJoined) {
      socket.data.participantJoined = true;
      state.participants.add(socket.id);
    }

    if (!socket.data.answers) {
      socket.data.answers = {};
    }

    const q = data?.question;
    const choice = data?.choice;

    if (
      !["phishing", "ai"].includes(q) ||
      !["A", "B", "C"].includes(choice)
    ) {
      return;
    }

    const old = socket.data.answers[q];

    if (old && old !== choice) {
      state[q][old] = Math.max(0, state[q][old] - 1);
    }

    if (!old || old !== choice) {
      state[q][choice]++;
    }

    socket.data.answers[q] = choice;

    io.emit("state", payload());
  });

  socket.on("securityScore", data => {

    const raw = Number(data?.score);

    if (!Number.isFinite(raw)) {
      return;
    }

    const score = Math.max(
      0,
      Math.min(100, Math.round(raw / 20) * 20)
    );

    if (socket.data.securityScore != null) {

      const old = socket.data.securityScore;

      if (old !== score) {
        state.security[old] =
          Math.max(0, state.security[old] - 1);
      }

    } else {
      state.securityCompleted++;
    }

    state.security[score]++;
    socket.data.securityScore = score;

    if (!socket.data.completed) {
      socket.data.completed = true;
      state.completed++;
    }

    io.emit("state", payload());
  });

  socket.on("complete", () => {

    if (!socket.data.completed) {
      socket.data.completed = true;
      state.completed++;
      io.emit("state", payload());
    }

  });

  socket.on("reset", () => {

    if (socket.handshake.auth?.admin === "forum2026") {

      state.participants.clear();

      state.phishing = {
        A: 0,
        B: 0,
        C: 0
      };

      state.ai = {
        A: 0,
        B: 0,
        C: 0
      };

      state.security = {
        0: 0,
        20: 0,
        40: 0,
        60: 0,
        80: 0,
        100: 0
      };

      state.securityCompleted = 0;
      state.completed = 0;

      io.emit("state", payload());
    }

  });

  socket.on("disconnect", () => {

    if (socket.data.participantJoined) {
      state.participants.delete(socket.id);
      io.emit("state", payload());
    }

  });

});

server.listen(PORT, "0.0.0.0", () => {

  console.log(
    `Somali Media CyberSafe Live running on http://localhost:${PORT}`
  );

  console.log(
    "On the same Wi-Fi, use one of these addresses:"
  );

  for (const ip of getIPs()) {
    console.log(`  http://${ip}:${PORT}`);
  }

});
