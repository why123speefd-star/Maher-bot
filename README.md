
# 🤖 MaherBot v2.0 — Enterprise-Grade All-In-One Discord Bot

**MaherBot v2.0** is an enterprise-grade, high-performance Discord bot built with **Node.js** and **discord.js v14**. Designed to outperform conventional tools like Carl-bot and Dyno, MaherBot combines real-time security shielding, AI moderation, cross-server global chat networks, interactive minigames, and advanced server utilities into a single, seamless platform.

[![Discord.js](https://img.shields.io/npm/v/discord.js?style=flat-square&labelColor=%23202225&color=%235865F2&logo=npm&logoColor=white)](https://www.npmjs.com/package/discord.js)
[![Node.js](https://img.shields.io/badge/Node.js-v20%2B-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Ready-336791?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![OpenRouter](https://img.shields.io/badge/AI-OpenRouter%20Powered-7400B8?style=flat-square)](https://openrouter.ai/)

---

## 🌟 Key Modules & Feature Highlights

### 🛡️ 1. Security & Anti-Nuke Shield
* **Rate-Limited Action Protection**: Monitors rapid channel deletions, role deletions, mass bans, and mass kicks in real-time.
* **Automated Rogue Admin Neutralization**: Automatically strips permissions/roles and issues immediate bans to accounts exceeding configurable rate limits.
* **Audit-Log Stream Evaluation**: Built directly on `GuildAuditLogEntryCreate` for zero-latency execution.
* **Whitelist System**: Granular permission overrides for trusted admins and server owners.

### 🤖 2. Next-Gen AI Workflows (Powered by OpenRouter)
* **Real-time AI Chat AutoMod**: Scans incoming text context via OpenRouter (`meta-llama/llama-3-8b-instruct:free`) to automatically detect severe toxicity, harassment, and invite spam without relying on static word blacklists.
* **Smart Ticket Auto-Responder**: Reads user ticket descriptions upon opening and posts instant 3-step troubleshooting breakdowns to assist members while staff arrives.

### 🌐 3. Global Chat & Cross-Server Communications
* **Webhook Network Engine**: Connects designated channels across multiple Discord servers into a synchronized chat network.
* **Cross-Server Reply Context**: Preserves message references when replying, generating clean blockquote headers (`Replying to @User: "..."`) across all connected channels.

### 🎮 4. Minigames & Community Tools
* **Interactive UI Games**: Play button-driven Tic-Tac-Toe and Connect 4 directly within Discord channels.
* **Economy & Leveling**: Server-isolated balances, daily rewards, XP tracking, and custom rank card logic.
* **Tickets & Moderation**: Flexible ticket claim systems, transcript archives, case logging, and warning management.

---

## 📊 Feature Matrix


┌─────────────────────────────────────────────────────────────────────────────┐
│                             MAHERBOT V2.0 MODULES                           │
├──────────────────────────┬──────────────────────────┬───────────────────────┤
│    SECURITY & SHIELD     │      AI INTEGRATION      │ COMMUNITY & UTILITY   │
├──────────────────────────┼──────────────────────────┼───────────────────────┤
│ • Anti-Nuke Shield       │ • AI Chat AutoMod        │ • Global Chat Network │
│ • Real-Time Audit Scans  │ • Smart Ticket Assistant │ • Interactive Games   │
│ • Rate-Limit Enforcement │ • OpenRouter API Link    │ • Economy & Leveling  │
│ • Rogue Admin Neutralize │ • Instant Troubleshooting│ • Ticket Transcripts  │
└──────────────────────────┴──────────────────────────┴───────────────────────┘

---

## 📐 System Architecture


┌─────────────────────────┐
│    Discord Gateway      │
└────────────┬────────────┘
│
▼
┌─────────────────────────┐
│   discord.js Client     │
└────────────┬────────────┘
│
┌─────────────────────┼─────────────────────┐
▼                     ▼                     ▼
┌─────────────────────────┐ ┌───────────────┐ ┌────────────────────┐
│   Event & Command       │ │ OpenRouter    │ │   Database Layer   │
│   Pipelines             │ │ AI Engine     │ │ (PostgreSQL / KV)  │
└─────────────────────────┘ └───────────────┘ └────────────────────┘

---

## 📂 Project Structure


Maher-bot/
├── src/
│   ├── commands/
│   │   ├── Community/
│   │   │   └── globalchat.js        # Global chat configuration & webhook binding
│   │   └── Fun/
│   │       └── games.js             # Interactive Tic-Tac-Toe & Connect 4 minigames
│   ├── events/
│   │   ├── aiAutoMod.js             # OpenRouter-powered real-time chat scanner
│   │   ├── globalChatHandler.js     # Global channel listener & reply formatter
│   │   └── guildAuditLogEntryCreate.js # Real-time Anti-Nuke audit monitor
│   ├── services/
│   │   └── ticketAiService.js       # AI auto-responder for support tickets
│   └── utils/
│       ├── database.js              # Database facade & helper exports
│       └── database/
│           └── antinuke.js          # Anti-Nuke persistent configuration & key storage
├── .env.example
├── package.json
└── README.md

---

## 🚀 Quick Setup & Deployment

### Prerequisites
* **Node.js**: v20.10.0 or higher
* **Discord Bot Token** with Privileged Intents enabled (Server Members, Message Content)
* **OpenRouter API Key** (for AI AutoMod & Ticket Assistant)
* **Database**: PostgreSQL database or local file storage

### 1. Installation
```bash
git clone [https://github.com/your-username/Maher-bot.git](https://github.com/your-username/Maher-bot.git)
cd Maher-bot
npm install

2. Environment Configuration
Create a .env file in the root directory:
DISCORD_TOKEN=your_discord_bot_token
CLIENT_ID=your_client_id
OPENROUTER_API_KEY=your_openrouter_api_key

# Database Settings
POSTGRES_URL=postgresql://postgres:password@localhost:5432/maherbot

3. Start MaherBot
npm start

🔒 Required Bot Intents & Permissions
Intents
 * Guilds
 * Guild Messages
 * Message Content
 * Guild Members
 * Guild Moderation (Audit Logs)
Key Permissions
 * Manage Webhooks (Global Chat)
 * Manage Roles & Ban Members (Anti-Nuke Shield)
 * Manage Messages (AI AutoMod)
 * Send Messages & Embed Links
📄 License
Distributed under the MIT License. See LICENSE for more details.

