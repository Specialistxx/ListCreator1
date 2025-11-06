require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits } = require('discord.js');
const express = require('express');

// ===== Discord Client Setup =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.commands = new Collection();

// ===== Load Commands =====
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  client.commands.set(command.data.name, command);
}

// ===== Load Events =====
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
  const event = require(`./events/${file}`);
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args));
  } else {
    client.on(event.name, (...args) => event.execute(...args));
  }
}

// ===== Login to Discord =====
client.login(process.env.TOKEN)
  .then(() => console.log('✅ Bot logged in successfully.'))
  .catch(err => {
    console.error('❌ Login failed:', err);
    process.exit(1); // restart on login failure
  });

// ===== Keep-Alive Server =====
const app = express();
app.get('/', (req, res) => res.send('Bot is alive.'));
app.listen(3000, () => console.log('🌐 Keep-alive server is running on port 3000.'));

// ===== Self-Ping =====
setInterval(() => {
  fetch('https://listcreator1.onrender.com')
    .then(() => console.log('🔁 Self-pinged to stay awake.'))
    .catch(err => console.log('⚠️ Ping failed:', err));
}, 5 * 60 * 1000); // every 5 minutes

// ===== Optional Auto-Restart on Discord Errors =====
client.on('error', (err) => {
  console.error('❌ Discord client error:', err);
  process.exit(1);
});
client.on('shardError', (err) => {
  console.error('❌ Discord shard error:', err);
  process.exit(1);
});
